import test from 'node:test';
import assert from 'node:assert/strict';
import type { TravelSourceConfig } from '../src/types/travel.ts';
import { MARTRAVEL_SOURCE, MARTRAVEL_LOGIN_URL, buildTravelSources, readLegacyEnabled, visibleTravelTabs, travelTabOrFallback } from '../src/services/marTravel.ts';

const base = (id: string, active: boolean, isPrimary = false): TravelSourceConfig => ({
  id, name: id, partnerKey: 'clickbus', type: 'rodoviario', active, isPrimary, queryMethod: 'link_parametrizado',
  coverageDescription: '', status: 'ativo', requiresCredentials: false, credentialsConfigured: false, callTimeoutMs: 1000,
});
const DEFAULT_TRAVEL_SOURCES_CONFIG = [base('src_queropassagem', true, true), base('src_clickbus', true), base('src_buser', false)];

test('Mar Travel é a fonte oficial: primeira, principal e ativa', () => {
  const list = buildTravelSources(DEFAULT_TRAVEL_SOURCES_CONFIG, false);
  assert.equal(list[0].id, MARTRAVEL_SOURCE.id);
  assert.equal(list[0].isPrimary, true);
  assert.equal(list[0].active, true);
  assert.equal(list.filter((s) => s.isPrimary).length, 1);
  assert.match(MARTRAVEL_LOGIN_URL, /^https:\/\/viaje\.martravel\.com\.br\//);
});

test('buscas antigas ficam desligadas por padrão, mas continuam na lista', () => {
  const list = buildTravelSources(DEFAULT_TRAVEL_SOURCES_CONFIG, false);
  assert.equal(list.length, DEFAULT_TRAVEL_SOURCES_CONFIG.length + 1);
  assert.ok(list.slice(1).every((s) => s.active === false && s.isPrimary === false));
});

test('religar as buscas antigas volta ao estado de cada uma, sem tirar a Mar Travel do topo', () => {
  const list = buildTravelSources(DEFAULT_TRAVEL_SOURCES_CONFIG, true);
  assert.equal(list[0].id, MARTRAVEL_SOURCE.id);
  DEFAULT_TRAVEL_SOURCES_CONFIG.forEach((s, i) => assert.equal(list[i + 1].active, s.active));
  assert.ok(list.slice(1).every((s) => s.isPrimary === false));
});

test('com as buscas antigas desligadas, somem as abas de busca, comparativo e reconsulta', () => {
  const on = ['viagens-painel', 'viagens-busca', 'viagens-resultados', 'viagens-historico', 'viagens-solicitacoes', 'viagens-configuracoes'] as const;
  assert.deepEqual(visibleTravelTabs([...on], false), ['viagens-painel', 'viagens-solicitacoes', 'viagens-configuracoes']);
  assert.deepEqual(visibleTravelTabs([...on], true), [...on]);
  assert.equal(travelTabOrFallback('viagens-busca', false), 'viagens-painel');
  assert.equal(travelTabOrFallback('viagens-busca', true), 'viagens-busca');
  assert.equal(travelTabOrFallback('viagens-solicitacoes', false), 'viagens-solicitacoes');
});

test('configuração salva: só "true" religa as buscas antigas', () => {
  assert.equal(readLegacyEnabled(undefined), false);
  assert.equal(readLegacyEnabled({}), false);
  assert.equal(readLegacyEnabled({ legacySourcesEnabled: 'sim' }), false);
  assert.equal(readLegacyEnabled({ legacySourcesEnabled: true }), true);
});
