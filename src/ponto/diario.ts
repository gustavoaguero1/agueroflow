// Ponto → Diário (decisão A): as horas do dia vêm do ponto; o Diário só confirma a obra.
import { horasDoDia } from './jornada.ts';
import type { PontoConfig, TipoMarcacao } from './config.ts';

export interface SugestaoDiario { hn: number; h50: number; h100: number; obra: string | null; incompleto: boolean; marcacoes: string[] }

export function sugestoesDoDia(p: {
  dataISO: string;
  porPessoa: { rhId: string; cfg: PontoConfig; marcacoes: { tipo: TipoMarcacao; dataHora: string; unitId: string | null }[] }[];
}): Record<string, SugestaoDiario> {
  const out: Record<string, SugestaoDiario> = {};
  for (const pessoa of p.porPessoa) {
    if (!pessoa.marcacoes.length) continue;
    const ord = [...pessoa.marcacoes].sort((a, b) => Date.parse(a.dataHora) - Date.parse(b.dataHora));
    const h = horasDoDia(ord, p.dataISO, pessoa.cfg);
    out[pessoa.rhId] = {
      hn: h.hn, h50: h.h50, h100: h.h100, incompleto: h.incompleto,
      obra: ord.find((m) => m.unitId)?.unitId ?? null,
      marcacoes: ord.map((m) => m.dataHora.slice(11, 16)),
    };
  }
  return out;
}
