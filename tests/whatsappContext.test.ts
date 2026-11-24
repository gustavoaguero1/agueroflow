import test from 'node:test';
import assert from 'node:assert/strict';
import { createWhatsAppContext } from '../server/whatsappContext';

/** Conexão falsa: responde com a própria chave e guarda os ganchos recebidos. */
function fakeBridge(key: string, connected = false) {
  let hooks: Record<string, (...a: unknown[]) => unknown> = {};
  return {
    key,
    getWhatsAppBridgeStatus: () => ({ state: connected ? 'conectado' : 'desconectado', key }),
    sendMessageViaWhatsAppBridge: async () => ({ success: true, via: key }),
    startWhatsAppBridgeSession: async () => ({ state: 'aguardando_qr', key }),
    registerWhatsAppBridgeHooks: (h: typeof hooks) => { hooks = h; },
    fire: (name: string, ...a: unknown[]) => hooks[name]?.(...a),
  };
}

function fakeRegistry(initial: Array<{ key: string; orgId: string; uid: string | null; connected?: boolean }>) {
  const open = new Map(initial.map((s) => [s.key, fakeBridge(s.key, s.connected)]));
  const meta = new Map(initial.map((s) => [s.key, { orgId: s.orgId, uid: s.uid }]));
  const created: string[] = [];
  return {
    open, created,
    get: (k: string) => open.get(k),
    meta: (k: string) => meta.get(k),
    list: () => [...meta.entries()].map(([key, m]) => ({ key, ...m })),
    ensure: (k: string, m: { orgId: string; uid: string | null }) => {
      if (!open.has(k)) { open.set(k, fakeBridge(k)); created.push(k); }
      meta.set(k, m);
      return open.get(k)!;
    },
  };
}

const setup = (sessions: Parameters<typeof fakeRegistry>[0]) => {
  const reg = fakeRegistry(sessions);
  const ctx = createWhatsAppContext({ registry: reg as never, defaultOrgId: 'org1', blank: fakeBridge('blank') as never, officialKeyOf: () => undefined });
  ctx.attachAll();
  return { reg, ctx };
};

test('dentro da sessão de um usuário, as funções usam a conexão dele', async () => {
  const { ctx } = setup([{ key: 'u_a', orgId: 'org1', uid: 'a', connected: true }, { key: 'u_b', orgId: 'org1', uid: 'b', connected: true }]);
  const st = await ctx.runInSession({ key: 'u_b', orgId: 'org1', uid: 'b' }, () => ctx.api.getWhatsAppBridgeStatus());
  assert.equal((st as unknown as { key: string }).key, 'u_b');
});

test('usuário sem conexão vê "desconectado" (conexão em branco), sem abrir sessão', () => {
  const { reg, ctx } = setup([]);
  const st = ctx.runInSession({ key: 'u_z', orgId: 'org1', uid: 'z' }, () => ctx.api.getWhatsAppBridgeStatus());
  assert.equal((st as unknown as { key: string }).key, 'blank');
  assert.deepEqual(reg.created, []);
});

test('conectar abre a sessão do usuário com a empresa dele', async () => {
  const { reg, ctx } = setup([]);
  const st = await ctx.runInSession({ key: 'u_z', orgId: 'org9', uid: 'z' }, () => ctx.api.startWhatsAppBridgeSession());
  assert.equal((st as unknown as { key: string }).key, 'u_z');
  assert.deepEqual(reg.created, ['u_z']);
  assert.deepEqual(reg.meta('u_z'), { orgId: 'org9', uid: 'z' });
});

test('sem contexto (automação), usa o número da empresa padrão; nenhum conectado → conexão em branco', async () => {
  const a = setup([{ key: 'u_a', orgId: 'org1', uid: 'a', connected: true }]);
  assert.deepEqual(await a.ctx.api.sendMessageViaWhatsAppBridge({ toJidOrPhone: '1', text: 'x' } as never), { success: true, via: 'u_a' });
  const b = setup([{ key: 'u_a', orgId: 'org1', uid: 'a', connected: false }]);
  assert.equal((b.ctx.api.getWhatsAppBridgeStatus() as unknown as unknown as { key: string }).key, 'blank');
});

test('runAsOrgSender usa o número da empresa pedida', async () => {
  const { ctx } = setup([{ key: 'u_a', orgId: 'org1', uid: 'a', connected: true }, { key: 'u_c', orgId: 'org2', uid: 'c', connected: true }]);
  const r = await ctx.runAsOrgSender('org2', () => ctx.api.sendMessageViaWhatsAppBridge({ toJidOrPhone: '1', text: 'x' } as never));
  assert.deepEqual(r, { success: true, via: 'u_c' });
});

test('orgOfContext: empresa da sessão atual; sem contexto, a empresa padrão', () => {
  const { ctx } = setup([{ key: 'u_c', orgId: 'org2', uid: 'c', connected: true }]);
  assert.equal(ctx.orgOfContext(), 'org1');
  assert.equal(ctx.runInSession({ key: 'u_c', orgId: 'org2', uid: 'c' }, () => ctx.orgOfContext()), 'org2');
  assert.equal(ctx.runAsOrgSender('org7', () => ctx.orgOfContext()), 'org7');
});

test('automação de empresa sem WhatsApp conectado avisa no log em vez de enviar por outra empresa', async () => {
  const { ctx } = setup([{ key: 'u_c', orgId: 'org2', uid: 'c', connected: true }]);
  const warns: string[] = [];
  const orig = console.warn;
  console.warn = (m: string) => { warns.push(String(m)); };
  try {
    const r = await ctx.runAsOrgSender('org9', () => ctx.api.getWhatsAppBridgeStatus());
    assert.equal((r as unknown as { key: string }).key, 'blank');
  } finally {
    console.warn = orig;
  }
  assert.ok(warns.some((w) => w.includes('Sem WhatsApp conectado para a empresa org9')));
});

test('isCompanySession: só a conexão que é o remetente da empresa faz as automações', () => {
  const { ctx } = setup([{ key: 'u_a', orgId: 'org1', uid: 'a', connected: true }, { key: 'u_b', orgId: 'org1', uid: 'b', connected: true }]);
  // sem número oficial: a mais antiga conectada (aqui as duas têm since=0 → a primeira da lista)
  assert.equal(ctx.runInSession({ key: 'u_a', orgId: 'org1', uid: 'a' }, () => ctx.isCompanySession()), true);
  assert.equal(ctx.runInSession({ key: 'u_b', orgId: 'org1', uid: 'b' }, () => ctx.isCompanySession()), false);
  assert.equal(ctx.isCompanySession(), false);
});

test('sem contexto e sem nenhum WhatsApp na empresa padrão: avisa no log', () => {
  const { ctx } = setup([]);
  const warns: string[] = [];
  const orig = console.warn;
  console.warn = (m: string) => { warns.push(String(m)); };
  try { ctx.api.getWhatsAppBridgeStatus(); } finally { console.warn = orig; }
  assert.ok(warns.some((w) => w.includes('Sem WhatsApp conectado para a empresa org1')));
});

test('gancho lê a empresa da sessão a cada mensagem (troca de empresa vale na hora)', async () => {
  const { reg, ctx } = setup([{ key: 'u_a', orgId: 'org1', uid: 'a', connected: true }]);
  const seen: string[] = [];
  ctx.api.registerWhatsAppBridgeHooks({ onIncomingMessage: () => { seen.push(ctx.orgOfContext()); } } as never);
  reg.get('u_a')!.fire('onIncomingMessage', {});
  reg.ensure('u_a', { orgId: 'org2', uid: 'a' });
  reg.get('u_a')!.fire('onIncomingMessage', {});
  assert.deepEqual(seen, ['org1', 'org2']);
});

test('forEachOrg roda a tarefa uma vez por empresa, cada uma no próprio contexto', async () => {
  const { ctx } = setup([{ key: 'u_a', orgId: 'org1', uid: 'a', connected: true }, { key: 'u_c', orgId: 'org2', uid: 'c', connected: true }]);
  const seen: string[] = [];
  await ctx.forEachOrg(['org3', 'org1'], async () => { seen.push(`${ctx.orgOfContext()}:${ctx.currentSession()?.key}`); });
  assert.deepEqual(seen.sort(), ['org1:u_a', 'org2:u_c', 'org3:__sem_whatsapp__']);
});

test('ganchos registrados uma vez valem para todas as conexões, e rodam no contexto de quem recebeu', async () => {
  const { reg, ctx } = setup([{ key: 'u_a', orgId: 'org1', uid: 'a', connected: true }]);
  const seen: unknown[] = [];
  ctx.api.registerWhatsAppBridgeHooks({ onIncomingMessage: () => { seen.push(ctx.currentSession()); } } as never);
  await ctx.runInSession({ key: 'u_n', orgId: 'org5', uid: 'n' }, () => ctx.api.startWhatsAppBridgeSession());
  reg.get('u_a')!.fire('onIncomingMessage', {});
  reg.get('u_n')!.fire('onIncomingMessage', {});
  assert.deepEqual(seen, [
    { key: 'u_a', orgId: 'org1', uid: 'a' },
    { key: 'u_n', orgId: 'org5', uid: 'n' },
  ]);
});
