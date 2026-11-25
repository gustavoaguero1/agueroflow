import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  Flame,
  Layers,
  Plus,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { apiFetch } from '../../apiAuthFetch';
import type { Project } from '../../types/project';
import type {
  MaterialLot,
  NdtReport,
  ProjectDataBookReport,
  QualityItpMatrix,
  WeldJoint,
  WelderQualification,
  WeldingProcedure,
} from '../../types/industrialQuality';
import { compileProjectDataBook, traceHeatNumberApplications } from '../../services/industrialQualityRules';

type IndustrialTab = 'soldas' | 'eps_soldadores' | 'end' | 'lotes' | 'itp' | 'databook';

export interface IndustrialQualityPanelProps {
  selectedContractId?: string;
}

export const IndustrialQualityPanel: React.FC<IndustrialQualityPanelProps> = ({ selectedContractId }) => {
  const { organization } = useAuth();
  const orgId = organization?.id || '';
  const [activeTab, setActiveTab] = useState<IndustrialTab>('soldas');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [heatSearch, setHeatSearch] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [projects, setProjects] = useState<Project[]>([]);
  const [procedures, setProcedures] = useState<WeldingProcedure[]>([]);
  const [qualifications, setQualifications] = useState<WelderQualification[]>([]);
  const [lots, setLots] = useState<MaterialLot[]>([]);
  const [joints, setJoints] = useState<WeldJoint[]>([]);
  const [ndts, setNdts] = useState<NdtReport[]>([]);
  const [itps, setItps] = useState<QualityItpMatrix[]>([]);

  // Quick-add EPS state
  const [epsCode, setEpsCode] = useState('');
  const [epsTitle, setEpsTitle] = useState('');
  const [epsProcess, setEpsProcess] = useState<'TIG' | 'MIG' | 'MAG' | 'ER' | 'ORBITAL'>('TIG');
  const [epsBaseMetal, setEpsBaseMetal] = useState('');
  const [epsFillerMetal, setEpsFillerMetal] = useState('');

  useEffect(() => {
    if (!selectedContractId || projects.length === 0) return;
    const match = projects.find((p) => p.contractId === selectedContractId);
    if (match) setSelectedProjectId(match.id);
  }, [selectedContractId, projects]);

  const loadAll = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const safeFetch = async <T,>(coll: string): Promise<T[]> => {
        try {
          const snap = await getDocs(query(collection(db, coll), where('orgId', '==', orgId)));
          return snap.docs.map((d) => ({ ...(d.data() as T), id: d.id }));
        } catch {
          return [];
        }
      };
      const [p, eps, q, l, j, n, i] = await Promise.all([
        safeFetch<Project>('projects'),
        safeFetch<WeldingProcedure>('welding_procedures'),
        safeFetch<WelderQualification>('welder_qualifications'),
        safeFetch<MaterialLot>('material_lots'),
        safeFetch<WeldJoint>('weld_joints'),
        safeFetch<NdtReport>('ndt_reports'),
        safeFetch<QualityItpMatrix>('quality_itp_matrices'),
      ]);
      setProjects(p);
      setProcedures(eps);
      setQualifications(q);
      setLots(l);
      setJoints(j);
      setNdts(n);
      setItps(i);
      if (!selectedProjectId && p.length > 0) setSelectedProjectId(p[0].id);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, [orgId]);

  const projectJoints = useMemo(
    () => (selectedProjectId ? joints.filter((j) => j.projectId === selectedProjectId) : joints),
    [joints, selectedProjectId],
  );
  const projectNdts = useMemo(
    () => (selectedProjectId ? ndts.filter((r) => r.projectId === selectedProjectId) : ndts),
    [ndts, selectedProjectId],
  );
  const projectLots = useMemo(
    () => (selectedProjectId ? lots.filter((l) => !selectedProjectId || l.projectId === selectedProjectId) : lots),
    [lots, selectedProjectId],
  );

  const databook: ProjectDataBookReport | null = useMemo(() => {
    if (!orgId || !selectedProjectId) return null;
    return compileProjectDataBook({
      orgId,
      projectId: selectedProjectId,
      weldJoints: joints,
      ndtReports: ndts,
      materialLots: lots,
      itpMatrices: itps,
    });
  }, [orgId, selectedProjectId, joints, ndts, lots, itps]);

  const heatTrace = useMemo(() => {
    if (!orgId || !heatSearch.trim()) return null;
    return traceHeatNumberApplications({
      orgId,
      heatNumber: heatSearch,
      lots,
      joints,
    });
  }, [orgId, heatSearch, lots, joints]);

  const handleCreateEps = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const res = await apiFetch('/api/industrial-quality/procedures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: epsCode,
        title: epsTitle,
        process: epsProcess,
        baseMetal: epsBaseMetal,
        fillerMetal: epsFillerMetal,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      setFeedback(data?.error || 'Falha ao cadastrar EPS.');
      return;
    }
    setEpsCode('');
    setEpsTitle('');
    setEpsBaseMetal('');
    setEpsFillerMetal('');
    setFeedback(`Procedimento ${data.procedure.code} cadastrado com sucesso.`);
    await loadAll();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Flame className="w-5 h-5 text-orange-500" />
            <span>Soldagem, END, Rastreabilidade &amp; Data Book</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Passaporte de juntas soldadas, EPS/WPS, sinete de soldadores, laudos END com instrumento calibrado, lotes/corridas e ITP/PIT.
          </p>
        </div>

        <select
          value={selectedProjectId}
          onChange={(e) => setSelectedProjectId(e.target.value)}
          className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-900 dark:text-white"
        >
          <option value="">Todos os Projetos / Obras</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} — {p.name}
            </option>
          ))}
        </select>
      </div>

      {feedback && (
        <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-xs text-blue-800 dark:text-blue-200">
          {feedback}
        </div>
      )}

      {/* Sub-navigation */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        {[
          { id: 'soldas' as IndustrialTab, label: `Passaporte de Soldas (${projectJoints.length})`, icon: Flame },
          { id: 'eps_soldadores' as IndustrialTab, label: `EPS & Soldadores (${procedures.length}/${qualifications.length})`, icon: Award },
          { id: 'end' as IndustrialTab, label: `END & Hidrostático (${projectNdts.length})`, icon: ShieldCheck },
          { id: 'lotes' as IndustrialTab, label: `Lotes & Corridas (${projectLots.length})`, icon: Layers },
          { id: 'itp' as IndustrialTab, label: `ITP / PIT (${itps.length})`, icon: ClipboardCheck },
          { id: 'databook' as IndustrialTab, label: 'Data Book / Dossiê', icon: FileCheck2 },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                active
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="py-12 text-center text-xs text-slate-500">Carregando registros industriais...</div>
      ) : (
        <>
          {activeTab === 'soldas' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 overflow-x-auto">
              {projectJoints.length === 0 ? (
                <p className="text-xs text-slate-500 py-8 text-center">
                  Nenhuma junta soldada registrada neste escopo. Cadastre via API <code>/api/industrial-quality/weld-joints</code> com EPS ativa e soldador qualificado.
                </p>
              ) : (
                <table className="w-full text-xs text-left">
                  <thead className="text-[11px] uppercase text-slate-500 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="py-2 pr-3">Junta</th>
                      <th className="py-2 pr-3">Linha / Spool</th>
                      <th className="py-2 pr-3">Corrida</th>
                      <th className="py-2 pr-3">EPS</th>
                      <th className="py-2 pr-3">Soldador / Sinete</th>
                      <th className="py-2 pr-3">Data</th>
                      <th className="py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {projectJoints.map((j) => (
                      <tr key={j.id}>
                        <td className="py-2.5 pr-3 font-mono font-semibold text-blue-600 dark:text-blue-400">{j.jointCode}</td>
                        <td className="py-2.5 pr-3">{j.lineOrSpool}</td>
                        <td className="py-2.5 pr-3 font-mono">{j.heatNumber}</td>
                        <td className="py-2.5 pr-3 font-mono">{j.epsCode}</td>
                        <td className="py-2.5 pr-3">{j.welderName} ({j.welderStamp})</td>
                        <td className="py-2.5 pr-3 font-mono">{j.weldDate}</td>
                        <td className="py-2.5 capitalize font-semibold">{j.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {activeTab === 'eps_soldadores' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <form onSubmit={handleCreateEps} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3 text-xs">
                <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-blue-500" />
                  <span>Nova EPS / WPS</span>
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  <input required value={epsCode} onChange={(e) => setEpsCode(e.target.value)} placeholder="Código (ex: EPS-316L-01)" className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700" />
                  <select value={epsProcess} onChange={(e) => setEpsProcess(e.target.value as any)} className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700">
                    <option value="TIG">TIG</option>
                    <option value="ORBITAL">ORBITAL</option>
                    <option value="MIG">MIG</option>
                    <option value="MAG">MAG</option>
                    <option value="ER">ER</option>
                  </select>
                </div>
                <input required value={epsTitle} onChange={(e) => setEpsTitle(e.target.value)} placeholder="Título do procedimento" className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700" />
                <div className="grid grid-cols-2 gap-2">
                  <input required value={epsBaseMetal} onChange={(e) => setEpsBaseMetal(e.target.value)} placeholder="Metal base (ex: AISI 316L)" className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700" />
                  <input required value={epsFillerMetal} onChange={(e) => setEpsFillerMetal(e.target.value)} placeholder="Metal de adição (ex: ER316L)" className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700" />
                </div>
                <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700">
                  Cadastrar EPS
                </button>
              </form>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2 text-xs">
                <h3 className="font-bold text-slate-900 dark:text-white">EPS Ativas ({procedures.length}) &amp; Soldadores Qualificados ({qualifications.length})</h3>
                {procedures.map((p) => (
                  <div key={p.id} className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex justify-between">
                    <div>
                      <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{p.code}</span> · {p.title}
                      <p className="text-[11px] text-slate-500">{p.process} · {p.baseMetal} / {p.fillerMetal}</p>
                    </div>
                    <span className="uppercase text-[10px] font-bold">{p.status}</span>
                  </div>
                ))}
                {qualifications.map((q) => (
                  <div key={q.id} className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex justify-between">
                    <div>
                      <span className="font-mono font-bold">{q.stampCode}</span> — {q.employeeName} ({q.process})
                      <p className="text-[11px] text-slate-500">Válido até {q.qualifiedUntil}</p>
                    </div>
                    <span className="uppercase text-[10px] font-bold">{q.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'lotes' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-slate-400" />
                <input
                  value={heatSearch}
                  onChange={(e) => setHeatSearch(e.target.value)}
                  placeholder="Rastrear corrida metalúrgica (heat number) em lotes, OS e juntas..."
                  className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>
              {heatTrace && (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                  <p className="font-bold">Rastreabilidade da corrida <span className="font-mono">{heatTrace.heatNumber}</span></p>
                  <p>Lotes encontrados: <strong>{heatTrace.matchingLots.length}</strong> · OS aplicadas: <strong>{heatTrace.appliedOrderIds.length}</strong> · Juntas soldadas: <strong>{heatTrace.appliedJoints.length}</strong></p>
                </div>
              )}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 text-xs space-y-2">
                {projectLots.length === 0 ? (
                  <p className="text-slate-500 text-center py-6">Nenhum lote/corrida registrado.</p>
                ) : (
                  projectLots.map((l) => (
                    <div key={l.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex justify-between items-center">
                      <div>
                        <p className="font-semibold">{l.itemSku} — {l.itemName}</p>
                        <p className="text-[11px] text-slate-500">Lote: <span className="font-mono">{l.lotCode}</span> · Corrida: <span className="font-mono">{l.heatNumber}</span> · Certificado: {l.certificateNumber || 'Pendente'}</p>
                      </div>
                      <span className="font-mono font-bold">{l.receivedQuantity} {l.unitOfMeasure}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'end' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 text-xs space-y-2">
              {projectNdts.length === 0 ? (
                <p className="text-slate-500 text-center py-6">Nenhum laudo END / Teste Hidrostático registrado.</p>
              ) : (
                projectNdts.map((r) => (
                  <div key={r.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex justify-between">
                    <div>
                      <span className="font-mono font-bold">{r.reportCode}</span> · {r.method.toUpperCase()} · Instrumento: {r.instrumentTag}
                      <p className="text-[11px] text-slate-500">Inspecionado em {r.inspectedAt} por {r.inspectorName} · Critério: {r.acceptanceCriteria}</p>
                    </div>
                    <span className={`font-bold uppercase ${r.result === 'aprovado' ? 'text-emerald-600' : 'text-rose-600'}`}>{r.result}</span>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'itp' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 text-xs space-y-3">
              {itps.length === 0 ? (
                <p className="text-slate-500 text-center py-6">Nenhuma matriz ITP/PIT cadastrada.</p>
              ) : (
                itps.map((m) => (
                  <div key={m.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5">
                    <p className="font-bold">{m.code} — {m.title} ({m.revision})</p>
                    {m.steps.map((s) => (
                      <div key={s.id} className="flex justify-between text-[11px] pl-2 border-l-2 border-blue-500">
                        <span>[{s.pointType}] {s.stepNumber}. {s.activity} ({s.discipline})</span>
                        <span className="uppercase font-semibold">{s.status}</span>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'databook' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 text-xs">
              {!databook ? (
                <p className="text-slate-500 text-center py-6">Selecione um Projeto/Obra acima para compilar o Data Book.</p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">Completude do Data Book</h3>
                      <p className="text-[11px] text-slate-500">Gerado em {new Date(databook.generatedAt).toLocaleString('pt-BR')}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {databook.readyForRelease ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 font-bold">
                          <CheckCircle2 className="w-4 h-4" /> Liberado ({databook.completenessPercent}%)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-100 text-amber-800 font-bold">
                          <AlertTriangle className="w-4 h-4" /> Pendências ({databook.completenessPercent}%)
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950">
                      <p className="text-[11px] text-slate-500">Soldas aprovadas</p>
                      <p className="text-sm font-bold">{databook.counts.weldJointsApproved}/{databook.counts.weldJointsTotal}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950">
                      <p className="text-[11px] text-slate-500">Laudos END ok</p>
                      <p className="text-sm font-bold">{databook.counts.ndtReportsApproved}/{databook.counts.ndtReportsTotal}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950">
                      <p className="text-[11px] text-slate-500">Corridas c/ cert.</p>
                      <p className="text-sm font-bold">{databook.counts.materialLotsWithCertificate}/{databook.counts.materialLotsTotal}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950">
                      <p className="text-[11px] text-slate-500">ITP Hold Points</p>
                      <p className="text-sm font-bold">{databook.counts.itpHoldPointsReleased}/{databook.counts.itpHoldPointsTotal}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950">
                      <p className="text-[11px] text-slate-500">NCs em aberto</p>
                      <p className="text-sm font-bold">{databook.counts.openQualityNcs}</p>
                    </div>
                  </div>
                  {databook.blockers.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="font-bold text-amber-700 dark:text-amber-400">Pendências para liberação do dossiê ({databook.blockers.length}):</p>
                      {databook.blockers.map((b, i) => (
                        <div key={`${b.code}_${i}`} className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900">
                          <span className="uppercase font-bold mr-1.5">[{b.category}]</span>
                          {b.message}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
