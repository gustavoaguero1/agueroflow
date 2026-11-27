import test from 'node:test';
import assert from 'node:assert/strict';
import { createWsSelfBookingClient } from '../server/lemontech/wsSelfBooking.ts';

const cfg = { endpoint: 'https://x/ws', creds: { userName: 'a', userPassword: 'b', keyClient: 'c' } };

test('Lemontech sem resposta: desiste no tempo limite com mensagem clara (não pendura a tela)', async () => {
  const pendurado = (_u: string, init: any) => new Promise((_r, rej) => {
    init.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
  const client = createWsSelfBookingClient(cfg, pendurado as any, { timeoutMs: 50 });
  await assert.rejects(client.pesquisarSolicitacao({ idSolicitacao: '1' }), /não respondeu em 0,05 s.*IP/);
});

test('falha de rede vira mensagem clara com a causa', async () => {
  const recusa = async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }); };
  const client = createWsSelfBookingClient(cfg, recusa as any);
  await assert.rejects(client.pesquisarSolicitacao({ idSolicitacao: '1' }), /Não foi possível conectar à Mar Travel \(ECONNREFUSED\)/);
});

test('HTTP 403 sem SOAP Fault vira mensagem de acesso negado', async () => {
  const proibido = async () => ({ ok: false, status: 403, text: async () => '<html>Forbidden</html>' });
  const client = createWsSelfBookingClient(cfg, proibido as any);
  await assert.rejects(client.pesquisarSolicitacao({ idSolicitacao: '1' }), /recusou o acesso \(HTTP 403\)/);
});
