// Configuração do ponto: padrão da empresa → estabelecimento → pessoa (a mais específica vence).
// Lógica pura: usada pelo servidor e pelo app.

export type TipoMarcacao = 'entrada' | 'saida_almoco' | 'volta_almoco' | 'saida';
export const TIPOS_MARCACAO: TipoMarcacao[] = ['entrada', 'saida_almoco', 'volta_almoco', 'saida'];

export const TIPO_LABEL: Record<TipoMarcacao, string> = {
  entrada: 'Entrada',
  saida_almoco: 'Saída para o almoço',
  volta_almoco: 'Volta do almoço',
  saida: 'Saída',
};

export interface PontoConfig {
  inicio: string; // "07:00"
  fim: string; // "17:00"
  almocoMin: number;
  dias: number[]; // 0 = domingo
  marcacoesPorDia: 2 | 4;
  raioM: number;
  toleranciaMin: number;
  feriados: string[]; // YYYY-MM-DD
  batePonto: boolean;
}

export const PONTO_DEFAULTS: PontoConfig = {
  inicio: '07:00',
  fim: '17:00',
  almocoMin: 60,
  dias: [1, 2, 3, 4, 5],
  marcacoesPorDia: 4,
  raioM: 300,
  toleranciaMin: 10,
  feriados: [],
  batePonto: true,
};

const defined = <T extends object>(o?: Partial<T>): Partial<T> =>
  Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => v !== undefined && v !== null)) as Partial<T>;

export function resolveConfig(estab?: Partial<PontoConfig>, pessoa?: Partial<PontoConfig>): PontoConfig {
  return { ...PONTO_DEFAULTS, ...defined(estab), ...defined(pessoa) };
}
