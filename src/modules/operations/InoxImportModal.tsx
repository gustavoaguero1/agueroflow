import React, { useState } from 'react';
import { Upload, X, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import {
  importInoxBackup, importGases, parseInoxBackup, summarizeInoxBackup, detectGasesFile, GAS_LABELS,
  type InoxBackup, type GasKind,
} from './opsBridge';

const LABELS: Record<string, string> = {
  colaboradores: 'Colaboradores', obras: 'Obras', candidatos: 'Candidatos', indicacoes: 'Indicações',
  direcionamentos: 'Direcionamentos', tarefas: 'Tarefas', notificacoes: 'Notificações', economias: 'Economias',
  reemb_notas: 'Notas de reembolso', reemb_lotes: 'Lotes de reembolso', vales: 'Vales', diario: 'Diário de obras',
  viagens: 'Hora viagem', passagens: 'Passagens', contatos: 'Contatos', fat_pedidos: 'Pedidos (faturamento)',
  fat_nfs: 'Notas fiscais', fat_cobrancas: 'Cobranças', membros: 'Papéis da equipe', salarios: 'Salários',
};

type GasFile = { name: string; kind: GasKind; rows: unknown[] };

/**
 * Importa o backup do Aguero Inox e/ou os arquivos da Central de Controle de Gases
 * (lancamentos.json, pendencias.json, boletos.json). Pode escolher vários de uma vez.
 */
export const InoxImportModal: React.FC<{ orgId: string; allowInox: boolean; onClose: () => void; onDone: () => void }> = ({ orgId, allowInox, onClose, onDone }) => {
  const [backup, setBackup] = useState<InoxBackup | null>(null);
  const [gases, setGases] = useState<GasFile[]>([]);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof importInoxBackup>> | null>(null);
  const [gasResult, setGasResult] = useState<Record<GasKind, number> | null>(null);

  const pick = async (list?: FileList | null) => {
    setError(''); setBackup(null); setGases([]); setResult(null); setGasResult(null);
    if (!list?.length) return;
    const found: GasFile[] = [];
    const bad: string[] = [];
    for (const f of Array.from(list)) {
      let json: unknown;
      try { json = JSON.parse(await f.text()); } catch { bad.push(`${f.name} (não é um .json válido)`); continue; }
      const kind = detectGasesFile(json);
      if (kind) { found.push({ name: f.name, kind, rows: json as unknown[] }); continue; }
      let inox: InoxBackup | null = null;
      try { inox = parseInoxBackup(JSON.stringify(json)); } catch { bad.push(f.name); continue; }
      if (!allowInox) { bad.push(`${f.name} (backup do Inox: precisa de acesso de edição ao RH, porque cria funcionários)`); continue; }
      setBackup(inox);
    }
    setGases(found);
    if (bad.length) {
      setError(`Não reconheci: ${bad.join(', ')}. Use o backup do Inox ou os arquivos de gases (lançamentos, pendências e boletos).`);
    }
  };

  const run = async () => {
    if (!backup && !gases.length) return;
    setBusy(true); setError('');
    try {
      if (backup) setResult(await importInoxBackup(orgId, backup, setProgress));
      if (gases.length) setGasResult(await importGases(orgId, gases, setProgress));
      onDone();
    } catch (e: any) {
      setError(`A importação parou: ${e?.message || e}. Você pode importar os mesmos arquivos de novo; nada é duplicado.`);
    } finally { setBusy(false); }
  };

  const s = backup && summarizeInoxBackup(backup);
  const done = !!(result || gasResult);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Importar dados</h2>
          <button onClick={onClose} disabled={busy} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Fechar"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4 text-sm text-slate-700 dark:text-slate-300">
          <p>
            Escolha o backup do Aguero Inox (<code className="text-xs">inox-backup-….json</code>) e/ou os arquivos da
            Central de Controle de Gases (lançamentos, pendências e boletos). Pode selecionar vários de uma vez.
            Importar de novo atualiza em vez de duplicar.
          </p>
          <label className="flex items-center gap-2 cursor-pointer w-fit px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 hover:border-blue-500">
            <Upload className="w-4 h-4" /> Escolher arquivos
            <input type="file" multiple accept="application/json,.json" className="hidden" disabled={busy} onChange={(e) => pick(e.target.files)} />
          </label>

          {s && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2">
              <div className="text-xs text-slate-500">Backup do Inox de {new Date(backup!.geradoEm).toLocaleString('pt-BR')}</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1">
                {Object.entries(s.colecoes).map(([k, n]) => (
                  <div key={k} className="flex justify-between"><span>{LABELS[k] || k}</span><b className="tabular-nums">{n}</b></div>
                ))}
              </div>
              <div className="text-xs text-slate-500">
                {s.anexos} anexo(s) · arquivos de apoio: {s.arquivos.join(', ') || 'nenhum'} · configurações: {s.docs.join(', ') || 'nenhuma'}
              </div>
              {s.avisos.length > 0 && (
                <div className="text-xs text-amber-600 flex gap-1"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Avisos do backup: {s.avisos.join(' | ')}</div>
              )}
            </div>
          )}

          {gases.length > 0 && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-1">
              <div className="text-xs text-slate-500">Controle de gases</div>
              {gases.map((g) => (
                <div key={g.name} className="flex justify-between">
                  <span>{GAS_LABELS[g.kind]} <span className="text-xs text-slate-500">({g.name})</span></span>
                  <b className="tabular-nums">{g.rows.length}</b>
                </div>
              ))}
            </div>
          )}

          {progress && busy && <div className="flex items-center gap-2 text-blue-600"><Loader2 className="w-4 h-4 animate-spin" /> {progress}</div>}
          {result && (
            <div className="space-y-1 text-emerald-600">
              <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Inox: importados {result.registros} registros e {result.anexos} anexos.</div>
              <div className="text-xs text-slate-600 dark:text-slate-400">
                Pessoas: {result.pessoasCasadas} ligadas a funcionários do RH, {result.pessoasCriadas} criadas no RH.
                Obras: {result.obrasCasadas} ligadas a unidades, {result.obrasCriadas} unidades criadas.
              </div>
            </div>
          )}
          {gasResult && (
            <div className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="w-4 h-4" />
              Gases: {gasResult.lancamentos} lançamentos, {gasResult.pendencias} pendências e {gasResult.boletos} boletos. Veja em Operações → Controle de gases.
            </div>
          )}
          {error && <div className="text-red-600">{error}</div>}
          {s && (
            <p className="text-xs text-slate-500">
              Pessoas viram funcionários do RH (quem já existe é ligado pelo nome; homônimos são criados à parte) e obras viram
              unidades. Os papéis da equipe (coordenador, auxiliar) estavam ligados às contas do Claude; depois de importar,
              confira em Operações → Configurações.
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-200 dark:border-slate-700">
          <button onClick={onClose} disabled={busy} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600">{done ? 'Fechar' : 'Cancelar'}</button>
          {!done && (
            <button onClick={run} disabled={(!backup && !gases.length) || busy} className="px-3 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50">
              {busy ? 'Importando…' : 'Importar'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
