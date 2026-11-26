/**
 * Mar Travel: canal oficial de compra de passagens aéreas e rodoviárias da empresa.
 * As buscas antigas (homologações) continuam no sistema, mas desligadas; um Admin ou Gerente pode religar.
 */
import type { TravelSourceConfig } from '../types/travel';

export const MARTRAVEL_LOGIN_URL = 'https://viaje.martravel.com.br/login.open.mtw';

export const MARTRAVEL_SOURCE: TravelSourceConfig = {
  id: 'src_martravel',
  name: 'Mar Travel',
  partnerKey: 'martravel',
  type: 'aereo',
  active: true,
  isPrimary: true,
  queryMethod: 'obt_corporativo',
  coverageDescription:
    'Canal oficial da empresa para passagens aéreas e rodoviárias, com tarifas e descontos negociados. Hotéis em teste. Cada colaborador usa o próprio login.',
  status: 'ativo',
  officialDocumentationUrl: MARTRAVEL_LOGIN_URL,
  requiresCredentials: true,
  credentialsConfigured: false,
  callTimeoutMs: 20000,
  notes: 'Sem API pública: o servidor usa a sessão de cada colaborador na plataforma.',
};

/** Mar Travel primeiro; as demais ficam com o próprio estado só se as buscas antigas estiverem religadas. */
export function buildTravelSources(defaults: TravelSourceConfig[], legacyEnabled: boolean): TravelSourceConfig[] {
  return [
    MARTRAVEL_SOURCE,
    ...defaults
      .filter((s) => s.id !== MARTRAVEL_SOURCE.id)
      .map((s) => ({ ...s, isPrimary: false, active: legacyEnabled ? s.active : false })),
  ];
}

/** Abas que só existem para as buscas antigas (comparador das homologações). */
const LEGACY_TABS = new Set(['viagens-busca', 'viagens-resultados', 'viagens-historico']);

export function visibleTravelTabs<T extends string>(tabs: T[], legacyEnabled: boolean): T[] {
  return legacyEnabled ? tabs : tabs.filter((t) => !LEGACY_TABS.has(t));
}

/** Aba de busca antiga com as buscas desligadas cai no painel. */
export function travelTabOrFallback<T extends string>(tab: T, legacyEnabled: boolean): T | 'viagens-painel' {
  return !legacyEnabled && LEGACY_TABS.has(tab) ? 'viagens-painel' : tab;
}

/** Configuração salva da empresa: só `true` religa as buscas antigas. */
export function readLegacyEnabled(settings: { legacySourcesEnabled?: unknown } | null | undefined): boolean {
  return settings?.legacySourcesEnabled === true;
}
