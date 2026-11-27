// Espelho de ponto: marcações por dia + ajustes do RH (que nunca alteram a marcação original).
import { horasDoDia, type HorasDia } from '../../src/ponto/jornada.ts';
import { diasEntre } from '../../src/ponto/tempo.ts';
import type { PontoConfig, TipoMarcacao } from '../../src/ponto/config.ts';
import type { Ajuste, Alerta, MarcacaoRegistro, MetodoIdent } from './store.ts';

export interface LinhaEspelho {
  id?: string; nsr?: number; tipo: TipoMarcacao; dataHora: string; origem: 'ponto' | 'ajuste'; desconsiderada: boolean;
  alertas: Alerta[]; unitId?: string | null; ajusteId?: string; justificativa?: string;
  temFoto?: boolean; metodo?: MetodoIdent; faceScore?: number | null; distM?: number | null;
}
export interface DiaEspelho { data: string; marcacoes: LinhaEspelho[]; horas: HorasDia }
export interface Espelho { dias: DiaEspelho[]; totais: { hn: number; h50: number; h100: number; diasIncompletos: number } }

const r2 = (n: number) => Math.round(n * 100) / 100;

export function montarEspelho(p: { marcacoes: MarcacaoRegistro[]; ajustes: Ajuste[]; cfg: PontoConfig; inicio: string; fim: string }): Espelho {
  const risca = new Set(p.ajustes.filter((a) => a.acao === 'desconsiderar' && a.nsrRef).map((a) => `${a.estabId ?? ''}|${a.nsrRef}`));
  const totais = { hn: 0, h50: 0, h100: 0, diasIncompletos: 0 };
  const dias = diasEntre(p.inicio, p.fim).map((data): DiaEspelho => {
    const doPonto: LinhaEspelho[] = p.marcacoes.filter((m) => m.dia === data).map((m) => ({
      id: m.id, nsr: m.nsr, tipo: m.tipo, dataHora: m.dataHora, origem: 'ponto', alertas: m.alertas, unitId: m.unitId,
      temFoto: !!m.fotoDataUrl, metodo: m.metodo, faceScore: m.face?.score ?? null, distM: m.distM ?? null,
      desconsiderada: risca.has(`${m.estabId}|${m.nsr}`) || risca.has(`|${m.nsr}`),
    }));
    const incluidas: LinhaEspelho[] = p.ajustes
      .filter((a) => a.acao === 'incluir' && a.data === data && a.tipo && a.dataHora)
      .map((a) => ({ tipo: a.tipo!, dataHora: a.dataHora!, origem: 'ajuste', desconsiderada: false, alertas: [], ajusteId: a.id, justificativa: a.justificativa }));
    const marcacoes = [...doPonto, ...incluidas].sort((a, b) => Date.parse(a.dataHora) - Date.parse(b.dataHora));
    const horas = horasDoDia(marcacoes.filter((m) => !m.desconsiderada), data, p.cfg);
    totais.hn += horas.hn; totais.h50 += horas.h50; totais.h100 += horas.h100;
    if (horas.incompleto) totais.diasIncompletos += 1;
    return { data, marcacoes, horas };
  });
  return { dias, totais: { hn: r2(totais.hn), h50: r2(totais.h50), h100: r2(totais.h100), diasIncompletos: totais.diasIncompletos } };
}
