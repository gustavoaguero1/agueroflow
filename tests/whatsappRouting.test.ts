import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionForRequest, pickOrgSender } from '../server/whatsappRouting';

test('sessionForRequest: sem usuário → 401', () => {
  assert.deepEqual(sessionForRequest({ orgId: 'o' }), { error: 'Entre no AgueroFlow para usar o WhatsApp.', status: 401 });
});

test('sessionForRequest: sem empresa selecionada → 400', () => {
  const r = sessionForRequest({ user: { uid: 'abc' } });
  assert.equal('status' in r && r.status, 400);
});

test('sessionForRequest: usuário e empresa → sessão do usuário', () => {
  assert.deepEqual(sessionForRequest({ user: { uid: 'member_x1' }, orgId: 'org1' }), { key: 'u_member_x1', orgId: 'org1', uid: 'member_x1' });
});

const sessions = [
  { key: 'u_a', orgId: 'org1', uid: 'a', connected: true, since: 2 },
  { key: 'u_b', orgId: 'org1', uid: 'b', connected: true, since: 1 },
  { key: 'legacy', orgId: 'org1', uid: null, connected: false, since: 0 },
  { key: 'u_c', orgId: 'org2', uid: 'c', connected: true, since: 0 },
];

test('pickOrgSender: número oficial conectado é o escolhido', () => {
  assert.equal(pickOrgSender('org1', sessions, 'u_a'), 'u_a');
});

test('pickOrgSender: oficial caído → outra conectada da empresa (legacy primeiro, depois a mais antiga)', () => {
  assert.equal(pickOrgSender('org1', sessions.map((s) => (s.key === 'u_a' ? { ...s, connected: false } : s)), 'u_a'), 'u_b');
  assert.equal(pickOrgSender('org1', sessions.map((s) => (s.key === 'legacy' ? { ...s, connected: true } : s))), 'legacy');
});

test('pickOrgSender: nunca escolhe sessão de outra empresa; nenhuma conectada → null', () => {
  assert.equal(pickOrgSender('org2', sessions, 'u_a'), 'u_c');
  assert.equal(pickOrgSender('org3', sessions), null);
});
