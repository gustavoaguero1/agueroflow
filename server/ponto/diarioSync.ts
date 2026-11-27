// Recalcula as horas sugeridas do dia para o Diário de Operações (ops_orgs/{orgId}/ponto_dia/{dia}).
// Grava por pessoa (merge em linhas.<rhId>), para recálculos paralelos de pessoas diferentes não se sobrescreverem.
import { FieldValue } from 'firebase-admin/firestore';
import { getAdmin } from '../firebaseAdmin.ts';
import { resolveConfig } from '../../src/ponto/config.ts';
import { sugestoesDoDia, type SugestaoDiario } from '../../src/ponto/diario.ts';
import { toBrt } from '../../src/ponto/tempo.ts';
import { montarEspelho } from './espelho.ts';
import type { PontoStore } from './store.ts';

/** `null` numa linha = a pessoa não tem mais marcação válida no dia (remover). */
export type PontoDiaWriter = (orgId: string, dia: string, linhas: Record<string, SugestaoDiario | null>, atualizadoEm: string) => Promise<void>;

export const firestorePontoDiaWriter: PontoDiaWriter = async (orgId, dia, linhas, atualizadoEm) => {
  const h = getAdmin();
  if (!h) return;
  const patch = Object.fromEntries(Object.entries(linhas).map(([k, v]) => [k, v === null ? FieldValue.delete() : v]));
  await h.db.doc(`ops_orgs/${orgId}/ponto_dia/${dia}`).set({ linhas: patch, atualizadoEm }, { merge: true });
};

export async function recalcularPontoDia(store: PontoStore, write: PontoDiaWriter, orgId: string, dia: string, now: () => Date, rhId?: string): Promise<void> {
  const [pessoas, marcacoes, ajustes] = await Promise.all([
    rhId ? store.getPessoa(orgId, rhId).then((p) => (p ? [p] : [])) : store.listPessoas(orgId),
    store.listMarcacoes(orgId, { rhId, desde: dia, ate: dia }),
    store.listAjustes(orgId, { rhId, desde: dia, ate: dia }),
  ]);
  const estabs = new Map((await store.listEstabs(orgId)).map((e) => [e.id, e]));
  const alvo = pessoas.filter((p) => rhId || marcacoes.some((m) => m.rhId === p.rhId) || ajustes.some((a) => a.rhId === p.rhId));
  const porPessoa = alvo.map((p) => {
    const cfg = resolveConfig(estabs.get(p.estabelecimentoId)?.config, p.config);
    const esp = montarEspelho({ marcacoes: marcacoes.filter((m) => m.rhId === p.rhId), ajustes: ajustes.filter((a) => a.rhId === p.rhId), cfg, inicio: dia, fim: dia });
    const validas = esp.dias[0].marcacoes.filter((m) => !m.desconsiderada).map((m) => ({ tipo: m.tipo, dataHora: m.dataHora, unitId: m.unitId ?? null }));
    return { rhId: p.rhId, cfg, marcacoes: validas };
  });
  const sug = sugestoesDoDia({ dataISO: dia, porPessoa });
  const linhas: Record<string, SugestaoDiario | null> = {};
  for (const p of alvo) linhas[p.rhId] = sug[p.rhId] ?? null;
  if (!Object.keys(linhas).length) return;
  await write(orgId, dia, linhas, toBrt(now()));
}
