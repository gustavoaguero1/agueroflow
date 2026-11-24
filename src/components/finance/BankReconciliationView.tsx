import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { ArrowLeftRight, CheckCircle2, FileUp, RefreshCw } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import type { FinancePayableSettlement } from '../../types/finance';
import { parseFinanceBankStatement, type FinanceBankStatementRow } from '../../services/financeBankStatementParser';
import {
  importFinanceBankTransactions, matchFinanceBankTransaction,
  type FinanceBankMatch, type FinanceBankTransaction,
} from '../../services/financeBankReconciliationService';
import { brl } from '../../services/financeService';
import { btnGhost, btnPrimary, card, input, label, msgErr } from './ui';

const cents = (value: number) => Math.round((value + Number.EPSILON) * 100);
const dateDistance = (a: string, b: string) => Math.abs(Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000;
const dateLabel = (value: string) => value.split('-').reverse().join('/');

type Candidate = FinancePayableSettlement & { id: string };

export const BankReconciliationView: React.FC<{ orgId: string }> = ({ orgId }) => {
  const { role, isMaster, areaLevel } = useAuth();
  const canManage = isMaster || ((role === 'Admin' || role === 'Gerente') && areaLevel('financeiro') >= 2);
  const [transactions, setTransactions] = useState<FinanceBankTransaction[]>([]);
  const [settlements, setSettlements] = useState<Candidate[]>([]);
  const [matches, setMatches] = useState<FinanceBankMatch[]>([]);
  const [fileName, setFileName] = useState('');
  const [accountLabel, setAccountLabel] = useState('');
  const [preview, setPreview] = useState<FinanceBankStatementRow[]>([]);
  const [importBatchId, setImportBatchId] = useState('');
  const [busy, setBusy] = useState(false);
  const [matchingId, setMatchingId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const stopTransactions = onSnapshot(
      query(collection(db, 'finance_bank_transactions'), where('orgId', '==', orgId)),
      (snapshot) => setTransactions(snapshot.docs.map((d) => ({ ...(d.data() as FinanceBankTransaction), id: d.id })).sort((a, b) => b.date.localeCompare(a.date))),
      (err) => setError('Falha ao carregar extratos: ' + err.message),
    );
    const stopSettlements = onSnapshot(
      query(collection(db, 'finance_payable_settlements'), where('orgId', '==', orgId)),
      (snapshot) => setSettlements(snapshot.docs.map((d) => ({ ...(d.data() as Candidate), id: d.id }))),
      (err) => setError('Falha ao carregar pagamentos: ' + err.message),
    );
    const stopMatches = onSnapshot(
      query(collection(db, 'finance_bank_reconciliations'), where('orgId', '==', orgId)),
      (snapshot) => setMatches(snapshot.docs.map((d) => ({ ...(d.data() as FinanceBankMatch), id: d.id }))),
      (err) => setError('Falha ao carregar conciliações: ' + err.message),
    );
    return () => { stopTransactions(); stopSettlements(); stopMatches(); };
  }, [orgId]);

  const matchedByTransaction = useMemo(() => new Map(matches.map((match) => [match.transactionId, match])), [matches]);
  const matchedSettlements = useMemo(() => new Set(matches.map((match) => match.settlementId)), [matches]);
  const pendingCount = transactions.filter((item) => item.direction === 'debit' && !matchedByTransaction.has(item.id)).length;
  const matchedCount = matches.length;

  const handleFile = async (file?: File) => {
    setError(''); setNotice(''); setPreview([]); setFileName('');
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setError('O arquivo ultrapassa o limite de 10 MB.'); return; }
    try {
      const text = await file.text();
      const rows = parseFinanceBankStatement(file.name, text);
      setFileName(file.name);
      setPreview(rows);
      setImportBatchId(crypto.randomUUID());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível ler o extrato.');
    }
  };

  const importFile = async () => {
    if (!fileName || !preview.length || !importBatchId || !canManage) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await importFinanceBankTransactions({
        orgId, importBatchId, sourceFileName: fileName,
        ...(accountLabel.trim() ? { accountLabel: accountLabel.trim() } : {}),
        rows: preview,
      });
      setNotice('Importação concluída: ' + result.imported + ' lançamento(s) novo(s), ' + result.duplicates + ' duplicado(s) ignorado(s).');
      setPreview([]); setFileName(''); setImportBatchId('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao importar o extrato.');
    } finally { setBusy(false); }
  };

  const candidatesFor = (transaction: FinanceBankTransaction) => settlements
    .filter((settlement) => !matchedSettlements.has(settlement.id)
      && (settlement.paymentAmount ?? settlement.settledValue ?? 0) > 0
      && cents(settlement.paymentAmount ?? settlement.settledValue ?? 0) === cents(transaction.amount)
      && dateDistance(settlement.paymentDate, transaction.date) <= 7)
    .sort((a, b) => dateDistance(a.paymentDate, transaction.date) - dateDistance(b.paymentDate, transaction.date))
    .slice(0, 5);

  const confirmMatch = async (transaction: FinanceBankTransaction, settlement: Candidate) => {
    setMatchingId(transaction.id); setError(''); setNotice('');
    try {
      const id = await matchFinanceBankTransaction({ orgId, transactionId: transaction.id, settlementId: settlement.id });
      setNotice('Conciliação registrada. Evento ' + id + '. Nenhum título foi baixado ou alterado por esta ação.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível conciliar o lançamento.');
    } finally { setMatchingId(''); }
  };

  return (
    <div className="space-y-4">
      <div className={card + ' flex items-start gap-3'}>
        <div className="rounded-xl bg-cyan-950/60 p-2"><ArrowLeftRight className="h-5 w-5 text-cyan-300" /></div>
        <div>
          <h3 className="text-sm font-bold text-white">Conciliação bancária</h3>
          <p className="mt-1 text-xs text-slate-400">Importe extratos OFX ou CSV, compare débitos com pagamentos já registrados e confirme a correspondência manualmente.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className={card}><p className="text-[11px] text-slate-400">Débitos pendentes</p><p className="mt-1 text-xl font-bold text-amber-300">{pendingCount}</p></div>
        <div className={card}><p className="text-[11px] text-slate-400">Conciliações confirmadas</p><p className="mt-1 text-xl font-bold text-emerald-400">{matchedCount}</p></div>
      </div>

      {error && <p className={msgErr}>{error}</p>}
      {notice && <p className="rounded-lg border border-emerald-800/50 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-300">{notice}</p>}

      <section className={card + ' space-y-3'}>
        <div className="flex items-center gap-2"><FileUp className="h-4 w-4 text-cyan-300" /><h4 className="text-xs font-bold text-white">Importar extrato</h4></div>
        <p className="text-[11px] text-slate-400">Formatos aceitos: OFX e CSV com colunas de data, descrição/histórico e valor (ou débito/crédito). Limite de 10 MB e 2.000 lançamentos por arquivo.</p>
        {!canManage && <p className="text-[11px] text-amber-300">A importação e a confirmação de conciliações exigem Admin/Gerente com Financeiro nível 2.</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className={label}>Identificação da conta (opcional)</label><input className={input} value={accountLabel} onChange={(e) => setAccountLabel(e.target.value)} placeholder="Ex.: Itaú • Conta operacional" /></div>
          <div><label className={label}>Arquivo OFX ou CSV</label><input className={input} type="file" accept=".ofx,.csv" disabled={!canManage || busy} onChange={(e) => void handleFile(e.target.files?.[0])} /></div>
        </div>
        {preview.length > 0 && (
          <div className="space-y-2 rounded-lg border border-slate-700 bg-slate-950/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold text-white">{fileName} · {preview.length} lançamento(s)</p><button type="button" className={btnPrimary} disabled={busy || !canManage} onClick={() => void importFile()}>{busy ? 'Importando...' : 'Importar lançamentos'}</button></div>
            <div className="max-h-56 overflow-auto">
              <table className="w-full text-left text-[10px]">
                <thead className="sticky top-0 bg-slate-900 text-slate-400"><tr><th className="p-2">Data</th><th className="p-2">Descrição</th><th className="p-2">Tipo</th><th className="p-2 text-right">Valor</th></tr></thead>
                <tbody>{preview.slice(0, 12).map((row) => <tr key={row.rowNumber} className="border-t border-slate-800"><td className="p-2 whitespace-nowrap">{dateLabel(row.date)}</td><td className="p-2">{row.description}</td><td className="p-2">{row.direction === 'debit' ? 'Débito' : 'Crédito'}</td><td className="p-2 text-right whitespace-nowrap">{brl.format(row.amount)}</td></tr>)}</tbody>
              </table>
              {preview.length > 12 && <p className="pt-2 text-[10px] text-slate-500">Prévia dos primeiros 12; todos os {preview.length} serão importados.</p>}
            </div>
          </div>
        )}
      </section>

      <section className={card + ' space-y-3'}>
        <div className="flex items-center justify-between gap-2"><h4 className="text-xs font-bold text-white">Lançamentos do extrato</h4><button type="button" className={btnGhost} onClick={() => window.location.reload()}><RefreshCw className="h-3 w-3" />Atualizar</button></div>
        {transactions.length === 0 ? <p className="py-6 text-center text-xs text-slate-500">Nenhum extrato importado nesta empresa.</p> : (
          <div className="space-y-2">
            {transactions.slice(0, 250).map((transaction) => {
              const match = matchedByTransaction.get(transaction.id);
              const candidates = transaction.direction === 'debit' && !match ? candidatesFor(transaction) : [];
              return (
                <div key={transaction.id} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0"><p className="text-xs font-semibold text-white">{transaction.description}</p><p className="mt-1 text-[10px] text-slate-500">{dateLabel(transaction.date)} · {transaction.sourceFileName}{transaction.reference ? ' · Ref. ' + transaction.reference : ''}</p></div>
                    <div className="text-right"><p className={'font-mono text-sm font-bold ' + (transaction.direction === 'debit' ? 'text-rose-300' : 'text-emerald-300')}>{transaction.direction === 'debit' ? '−' : '+'}{brl.format(transaction.amount)}</p><p className="text-[9px] text-slate-500">{transaction.direction === 'debit' ? 'Débito' : 'Crédito'}</p></div>
                  </div>
                  {match ? (
                    <div className="flex items-center gap-2 rounded-md bg-emerald-950/40 px-2 py-2 text-[10px] text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" />Conciliado com pagamento {match.settlementId}</div>
                  ) : transaction.direction === 'credit' ? (
                    <p className="text-[10px] text-slate-500">Crédito importado. A conciliação de recebimentos não faz parte desta etapa.</p>
                  ) : (
                    <div className="space-y-2">
                      {candidates.length === 0 ? <p className="text-[10px] text-slate-500">Sem sugestão automática: procure o pagamento correspondente no histórico. Nenhuma associação foi feita.</p> : (
                        <div className="space-y-2">
                          <p className="text-[10px] text-cyan-300">Possíveis correspondências (valor exato e data em até 7 dias):</p>
                          {candidates.map((candidate) => (
                            <div key={candidate.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-800 px-2 py-2">
                              <div><p className="text-[10px] font-semibold text-slate-200">{candidate.payableSnapshot?.supplierName || 'Fornecedor'} · {candidate.payableSnapshot?.documento || candidate.payableId}</p><p className="text-[9px] text-slate-500">Pagamento {dateLabel(candidate.paymentDate)} · {brl.format(candidate.paymentAmount ?? candidate.settledValue)}</p></div>
                              <button type="button" className={btnPrimary} disabled={!canManage || matchingId === transaction.id} onClick={() => void confirmMatch(transaction, candidate)}>{matchingId === transaction.id ? 'Confirmando...' : 'Confirmar conciliação'}</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {transactions.length > 250 && <p className="text-[10px] text-slate-500">Exibindo os 250 lançamentos mais recentes. Os demais continuam armazenados e disponíveis no extrato importado.</p>}
          </div>
        )}
      </section>
      <p className="text-[10px] leading-relaxed text-slate-500">A conciliação cria somente um vínculo auditável entre o débito bancário e um evento de pagamento já existente. Não cria, altera ou baixa títulos, não executa transferências e não substitui a conferência do extrato no banco.</p>
    </div>
  );
};
