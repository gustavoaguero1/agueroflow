import React, { useState } from 'react';
import { Upload, X, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { importInoxBackup, parseInoxBackup, summarizeInoxBackup, type InoxBackup } from './opsBridge';

const LABELS: Record<string, string> = {
  colaboradores: 'Colaboradores', obras: 'Obras', candidatos: 'Candidatos', indicacoes: 'Indicações',
  direcionamentos: 'Direcionamentos', tarefas: 'Tarefas', notificacoes: 'Notificações', economias: 'Economias',
  reemb_notas: 'Notas de reembolso', reemb_lotes: 'Lotes de reembolso', vales: 'Vales', diario: 'Diário de obras',
  viagens: 'Hora viagem', passagens: 'Passagens', contatos: 'Contatos', fat_pedidos: 'Pedidos (faturamento)',
  fat_nfs: 'Notas fiscais', fat_cobrancas: 'Cobranças', membros: 'Papéis da equipe', salarios: 'Salários',
};

export const InoxImportModal: React.FC<{ orgId: string; onClose: () => void; onDone: () => void }> = ({ orgId, onClose, onDone }) => {
  const [backup, setBackup] = useState<InoxBackup | null>(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof importInoxBackup>> | null>(null);

  const pick = async (f?: File) => {
    setError(''); setBackup(null); setResult(null);
    if (!f) return;
    try { setBackup(parseInoxBackup(await f.text())); } catch (e: any) { setError(e?.message || 'Arquivo inválido.'); }
  };

  const run = async () => {
    if (!backup) return;
    setBusy(true); setError('');
    try {
      setResult(await importInoxBackup(orgId, backup, setProgress));
      onDone();
    } catch (e: any) {
      setError(`A importação parou: ${e?.message || e}. Você pode importar o mesmo arquivo de novo; nada é duplicado.`);
    } finally { setBusy(false); }
  };

  const s = backup && summarizeInoxBackup(backup);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Importar dados do Aguero Inox</h2>
          <button onClick={onClose} disabled={busy} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Fechar"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4 text-sm text-slate-700 dark:text-slate-300">
          <p>
            Selecione o arquivo <code className="text-xs">inox-backup-….json</code> gerado pelo script <code className="text-xs">tools/exportar-inox.js</code>.
            Os registros mantêm os mesmos códigos, então importar de novo atualiza em vez de duplicar.
          </p>
          <label className="flex items-center gap-2 cursor-pointer w-fit px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 hover:border-blue-500">
            <Upload className="w-4 h-4" /> Escolher arquivo
            <input type="file" accept="application/json,.json" className="hidden" disabled={busy} onChange={(e) => pick(e.target.files?.[0])} />
          </label>

          {s && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2">
              <div className="text-xs text-slate-500">Backup de {new Date(backup!.geradoEm).toLocaleString('pt-BR')}</div>
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

          {progress && busy && <div className="flex items-center gap-2 text-blue-600"><Loader2 className="w-4 h-4 animate-spin" /> {progress}</div>}
          {result && (
            <div className="space-y-1 text-emerald-600">
              <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Importados {result.registros} registros e {result.anexos} anexos.</div>
              <div className="text-xs text-slate-600 dark:text-slate-400">
                Pessoas: {result.pessoasCasadas} ligadas a funcionários do RH, {result.pessoasCriadas} criadas no RH.
                Obras: {result.obrasCasadas} ligadas a unidades, {result.obrasCriadas} unidades criadas.
              </div>
            </div>
          )}
          {error && <div className="text-red-600">{error}</div>}
          <p className="text-xs text-slate-500">
            Pessoas viram funcionários do RH (quem já existe é ligado pelo nome; homônimos são criados à parte) e obras viram
            unidades. Os papéis da equipe (coordenador, auxiliar) estavam ligados às contas do Claude; depois de importar,
            confira em Operações → Configurações.
          </p>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-200 dark:border-slate-700">
          <button onClick={onClose} disabled={busy} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600">{result ? 'Fechar' : 'Cancelar'}</button>
          {!result && (
            <button onClick={run} disabled={!backup || busy} className="px-3 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50">
              {busy ? 'Importando…' : 'Importar'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
