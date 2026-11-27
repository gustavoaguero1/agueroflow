// Cálculo de jornada do dia a partir das marcações (lógica pura).
import type { PontoConfig, TipoMarcacao } from './config.ts';

const SEQ4: TipoMarcacao[] = ['entrada', 'saida_almoco', 'volta_almoco', 'saida'];
const SEQ2: TipoMarcacao[] = ['entrada', 'saida'];

/** Próxima marcação esperada, pela sequência do dia (depois da última, recomeça em "entrada"). */
export function proximaMarcacao(tiposDoDia: TipoMarcacao[], cfg: PontoConfig): TipoMarcacao {
  const seq = cfg.marcacoesPorDia === 2 ? SEQ2 : SEQ4;
  return seq[tiposDoDia.length % seq.length];
}

const minutos = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Dia da semana (0 = domingo) da data YYYY-MM-DD, sem depender do fuso da máquina. */
const diaSemana = (dataISO: string) => new Date(`${dataISO}T12:00:00Z`).getUTCDay();

export interface HorasDia { hn: number; h50: number; h100: number; trabalhadoMin: number; incompleto: boolean }

export function horasDoDia(
  marcacoes: { tipo: TipoMarcacao; dataHora: string }[],
  dataISO: string,
  cfg: PontoConfig,
): HorasDia {
  const ts = marcacoes.map((m) => Date.parse(m.dataHora)).filter(Number.isFinite).sort((a, b) => a - b);
  if (ts.length === 0 || ts.length % 2 === 1) return { hn: 0, h50: 0, h100: 0, trabalhadoMin: 0, incompleto: ts.length > 0 };

  let trabalhado = 0;
  for (let i = 0; i < ts.length; i += 2) trabalhado += (ts[i + 1] - ts[i]) / 60000;
  // Almoço pré-assinalado só vale para jornada acima de 6 h (CLT art. 71).
  if (cfg.marcacoesPorDia === 2 && trabalhado > 360) trabalhado = Math.max(0, trabalhado - cfg.almocoMin);
  trabalhado = Math.round(trabalhado);

  const dow = diaSemana(dataISO);
  const horas = trabalhado / 60;
  if (dow === 0 || cfg.feriados.includes(dataISO)) return { hn: 0, h50: 0, h100: r2(horas), trabalhadoMin: trabalhado, incompleto: false };
  if (!cfg.dias.includes(dow)) return { hn: 0, h50: r2(horas), h100: 0, trabalhadoMin: trabalhado, incompleto: false };

  const jornada = minutos(cfg.fim) - minutos(cfg.inicio) - cfg.almocoMin;
  const excesso = trabalhado - jornada;
  const extra = excesso > cfg.toleranciaMin ? excesso : 0;
  const normal = Math.min(trabalhado, jornada);
  return { hn: r2(normal / 60), h50: r2(extra / 60), h100: 0, trabalhadoMin: trabalhado, incompleto: false };
}
