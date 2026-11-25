import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  Search,
  ShieldAlert,
  Users,
  Link2Off,
  CopyCheck,
} from 'lucide-react';
import {
  formatRhLegacyAuditCsv,
  type RhLegacyAuditReport,
} from '../../services/rhLegacyAudit';

interface RhLegacyPendenciesPanelProps {
  report: RhLegacyAuditReport;
  orgName: string;
  onReviewEmployee?: (employeeId: string) => void;
}

export const RhLegacyPendenciesPanel: React.FC<RhLegacyPendenciesPanelProps> = ({
  report,
  orgName,
  onReviewEmployee,
}) => {
  const [search, setSearch] = useState('');
  const [section, setSection] = useState<'all' | 'employees' | 'field_workers' | 'duplicates'>('all');

  const query = search.trim().toLowerCase();

  const filteredEmployees = useMemo(() => {
    if (!query) return report.employeePendencies;
    return report.employeePendencies.filter(
      (p) =>
        p.employeeName.toLowerCase().includes(query) ||
        p.employeeId.toLowerCase().includes(query) ||
        p.registrationNumber.toLowerCase().includes(query) ||
        p.reasons.some((r) => r.toLowerCase().includes(query))
    );
  }, [report.employeePendencies, query]);

  const filteredFieldWorkers = useMemo(() => {
    if (!query) return report.unlinkedFieldWorkers;
    return report.unlinkedFieldWorkers.filter(
      (w) =>
        w.workerName.toLowerCase().includes(query) ||
        w.fieldWorkerId.toLowerCase().includes(query) ||
        w.cpf.toLowerCase().includes(query) ||
        w.reason.toLowerCase().includes(query)
    );
  }, [report.unlinkedFieldWorkers, query]);

  const filteredDuplicates = useMemo(() => {
    if (!query) return report.possibleDuplicates;
    return report.possibleDuplicates.filter(
      (d) =>
        d.matchLabel.toLowerCase().includes(query) ||
        d.reason.toLowerCase().includes(query) ||
        d.recordIds.some((id) => id.toLowerCase().includes(query))
    );
  }, [report.possibleDuplicates, query]);

  const handleExportCsv = () => {
    const csv = '\uFEFF' + formatRhLegacyAuditCsv(report);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const slug = (orgName || report.summary.orgId || 'org').toLowerCase().replace(/[^a-z0-9]+/g, '_');
    link.download = `auditoria_pendencias_rh_${slug}_${report.summary.generatedAt.slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* Audit Banner */}
      <div className="bg-[#121826] border border-amber-800/60 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-amber-950/70 text-amber-400 border border-amber-800/50 shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">
              Relatório Auditável de Pendências Legadas de RH & Equipe de Campo
            </h2>
            <p className="text-xs text-slate-300 mt-1">
              Relatório somente leitura para <strong>revisão humana</strong>. Nenhuma associação por nome,
              preenchimento fictício ou fusão automática de cadastros é executada.
            </p>
            <p className="text-[11px] text-slate-400 mt-1 font-mono">
              Base analisada: {report.summary.totalRhEmployees} colaboradores RH •{' '}
              {report.summary.totalFieldWorkers} registros field_workers
              {report.summary.demoRecordsExcluded > 0
                ? ` • ${report.summary.demoRecordsExcluded} registro(s) de demonstração isolado(s)`
                : ''}
            </p>
          </div>
        </div>
        <button
          onClick={handleExportCsv}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold rounded-lg border border-slate-700 transition cursor-pointer shrink-0"
        >
          <Download className="w-4 h-4" />
          Exportar Auditoria (CSV)
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-[#121826] border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Colaboradores com Pendência</span>
            <Users className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-1.5">
            {report.summary.employeesWithPendencies}
          </div>
          <div className="text-[11px] text-rose-400 mt-0.5">
            {report.summary.criticalEmployeePendencies} crítica(s)
          </div>
        </div>

        <div className="bg-[#121826] border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Campo sem Vínculo RH</span>
            <Link2Off className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-1.5">
            {report.summary.unlinkedFieldWorkersCount}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {report.summary.brokenFieldWorkerLinksCount} vínculo(s) quebrado(s)
          </div>
        </div>

        <div className="bg-[#121826] border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Possíveis Duplicidades</span>
            <CopyCheck className="w-4 h-4 text-orange-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-1.5">
            {report.summary.possibleDuplicatesCount}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Revisão manual obrigatória</div>
        </div>

        <div className="bg-[#121826] border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Situação Geral</span>
            {report.summary.isClean ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            )}
          </div>
          <div
            className={`text-lg font-bold mt-1.5 ${
              report.summary.isClean ? 'text-emerald-400' : 'text-amber-300'
            }`}
          >
            {report.summary.isClean
              ? 'Base Consistente'
              : `${report.summary.totalIssues} Pendência(s)`}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
            {report.summary.generatedAt.slice(0, 19).replace('T', ' ')} UTC
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-[#121826] border border-slate-800 rounded-xl p-3 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'all', label: `Todas (${report.summary.totalIssues})` },
            { id: 'employees', label: `Cadastro RH (${report.employeePendencies.length})` },
            { id: 'field_workers', label: `Vínculo Campo (${report.unlinkedFieldWorkers.length})` },
            { id: 'duplicates', label: `Duplicidades (${report.possibleDuplicates.length})` },
          ].map((btn) => (
            <button
              key={btn.id}
              onClick={() => setSection(btn.id as typeof section)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                section === btn.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>

        <div className="relative sm:w-72">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar por nome, ID, CPF ou motivo..."
            className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {report.summary.isClean && (
        <div className="bg-emerald-950/30 border border-emerald-800/50 rounded-xl p-6 text-center space-y-2">
          <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
          <p className="text-sm font-bold text-emerald-200">
            Nenhuma pendência legada encontrada nesta organização.
          </p>
          <p className="text-xs text-slate-300">
            Todos os colaboradores de RH estão completos e os registros de equipe de campo possuem vínculo estável por ID.
          </p>
        </div>
      )}

      {/* 1. RH Employee Pendencies */}
      {(section === 'all' || section === 'employees') && filteredEmployees.length > 0 && (
        <div className="bg-[#121826] border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Colaboradores RH sem Dados Obrigatórios ({filteredEmployees.length})
            </h3>
          </div>
          <div className="divide-y divide-slate-800/70">
            {filteredEmployees.map((item) => (
              <div
                key={item.employeeId}
                className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-slate-900/40"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                        item.severity === 'critica'
                          ? 'bg-rose-950 text-rose-300 border border-rose-800'
                          : 'bg-amber-950 text-amber-300 border border-amber-800'
                      }`}
                    >
                      {item.severity}
                    </span>
                    <span className="text-xs font-bold text-white">{item.employeeName}</span>
                    <span className="text-[11px] font-mono text-slate-400">ID: {item.employeeId}</span>
                    {!item.active && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                        Inativo
                      </span>
                    )}
                  </div>
                  <ul className="text-xs text-slate-300 list-disc list-inside space-y-0.5">
                    {item.reasons.map((reason, idx) => (
                      <li key={idx}>{reason}</li>
                    ))}
                  </ul>
                </div>
                {onReviewEmployee && (
                  <button
                    onClick={() => onReviewEmployee(item.employeeId)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 text-xs font-semibold rounded-lg border border-blue-700/40 transition cursor-pointer shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Abrir Cadastro
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. Unlinked or Broken Field Workers */}
      {(section === 'all' || section === 'field_workers') && filteredFieldWorkers.length > 0 && (
        <div className="bg-[#121826] border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Equipe de Campo (field_workers) sem Vínculo RH Válido ({filteredFieldWorkers.length})
            </h3>
          </div>
          <div className="divide-y divide-slate-800/70">
            {filteredFieldWorkers.map((item) => (
              <div key={item.fieldWorkerId} className="p-4 space-y-2 hover:bg-slate-900/40">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-rose-950 text-rose-300 border border-rose-800">
                    {item.issueType === 'broken_rh_link' ? 'Vínculo Quebrado' : 'Sem rhEmployeeId'}
                  </span>
                  <span className="text-xs font-bold text-white">{item.workerName}</span>
                  <span className="text-[11px] font-mono text-slate-400">
                    field_workers/{item.fieldWorkerId}
                  </span>
                  {item.role && <span className="text-[11px] text-slate-400">• {item.role}</span>}
                </div>
                <p className="text-xs text-slate-300">{item.reason}</p>
                {item.suggestedCandidates.length > 0 && (
                  <div className="bg-slate-900/80 border border-slate-700/60 rounded-lg p-2.5 text-[11px] text-slate-300">
                    <span className="font-semibold text-amber-300">
                      Possível correspondência no RH (somente sugestão — confirmar manualmente antes de vincular):
                    </span>{' '}
                    {item.suggestedCandidates
                      .map((c) => `${c.employeeName} [${c.employeeId}]`)
                      .join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Possible Duplicates */}
      {(section === 'all' || section === 'duplicates') && filteredDuplicates.length > 0 && (
        <div className="bg-[#121826] border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Possíveis Duplicidades para Revisão Humana ({filteredDuplicates.length})
            </h3>
          </div>
          <div className="divide-y divide-slate-800/70">
            {filteredDuplicates.map((dup, idx) => (
              <div key={`${dup.kind}_${dup.matchKey}_${idx}`} className="p-4 space-y-2 hover:bg-slate-900/40">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                      dup.severity === 'critica'
                        ? 'bg-rose-950 text-rose-300 border border-rose-800'
                        : 'bg-amber-950 text-amber-300 border border-amber-800'
                    }`}
                  >
                    {dup.severity}
                  </span>
                  <span className="text-xs font-bold text-white">{dup.matchLabel}</span>
                  <span className="text-[11px] font-mono text-slate-400">{dup.kind}</span>
                </div>
                <p className="text-xs text-slate-300">{dup.reason}</p>
                <div className="flex flex-wrap gap-2">
                  {dup.records.map((rec) => (
                    <span
                      key={`${rec.collection}_${rec.id}`}
                      className="text-[11px] font-mono px-2 py-1 rounded bg-slate-900 border border-slate-700 text-slate-200"
                    >
                      {rec.collection}/{rec.id} ({rec.name}
                      {rec.status ? ` • ${rec.status}` : ''})
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
