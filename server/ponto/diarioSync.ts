// Recalcula as horas sugeridas do dia para o Diário de Operações (ops_orgs/{orgId}/ponto_dia/{dia}).
import { getAdmin } from '../firebaseAdmin.ts';
import { resolveConfig } from '../../src/ponto/config.ts';
import { sugestoesDoDia, type SugestaoDiario } from '../../src/ponto/diario.ts';
import { toBrt } from '../../src/ponto/tempo.ts';
import { montarEspelho } from './espelho.ts';
import type { PontoStore } from './store.ts';

export type PontoDiaWriter = (orgId: string, dia: string, doc: { linhas: Record<string, SugestaoDiario>; atualizadoEm: string }) => Promise<void>;

export const firestorePontoDiaWriter: PontoDiaWriter = async (orgId, dia, doc) => {
  const h = getAdmin();
  if (!h) return;
  await h.db.doc(`ops_orgs/${orgId}/ponto_dia/${dia}`).set(doc);
};

export async function recalcularPontoDia(store: PontoStore, write: PontoDiaWriter, orgId: string, dia: string, now: () => Date): Promise<void> {
  const [pessoas, marcacoes, ajustes] = await Promise.all([
    store.listPessoas(orgId), store.listMarcacoes(orgId, { desde: dia, ate: dia }), store.listAjustes(orgId, { desde: dia, ate: dia }),
  ]);
  const estabs = new Map((await store.listEstabs(orgId)).map((e) => [e.id, e]));
  const porPessoa = pessoas
    .filter((p) => marcacoes.some((m) => m.rhId === p.rhId) || ajustes.some((a) => a.rhId === p.rhId))
    .map((p) => {
      const cfg = resolveConfig(estabs.get(p.estabelecimentoId)?.config, p.config);
      const esp = montarEspelho({ marcacoes: marcacoes.filter((m) => m.rhId === p.rhId), ajustes: ajustes.filter((a) => a.rhId === p.rhId), cfg, inicio: dia, fim: dia });
      const validas = esp.dias[0].marcacoes.filter((m) => !m.desconsiderada).map((m) => ({ tipo: m.tipo, dataHora: m.dataHora, unitId: m.unitId ?? null }));
      return { rhId: p.rhId, cfg, marcacoes: validas };
    });
  await write(orgId, dia, { linhas: sugestoesDoDia({ dataISO: dia, porPessoa }), atualizadoEm: toBrt(now()) });
}
