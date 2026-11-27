import test from 'node:test';
import assert from 'node:assert/strict';
import { answerWithTools } from '../server/agentTools.ts';
import type { AdminHandles } from '../server/firebaseAdmin.ts';

test('ERP tools expose and execute only the caller’s allowed tools', async () => {
  const h = {} as AdminHandles;
  let calls = 0;
  const gen = async ({ contents, config }: any) => {
    calls++;
    assert.deepEqual(config.tools[0].functionDeclarations.map((tool: any) => tool.name), ['os_abertas']);
    if (calls === 1) return { functionCalls: [{ name: 'contas_a_pagar' }] };
    assert.match(contents.at(-1).parts[0].functionResponse.response.erro, /não autorizada/);
    return { text: 'Sem acesso' };
  };
  assert.equal(await answerWithTools(h, 'org', 'pergunta', [], gen, new Set(['os_abertas'])), 'Sem acesso');
  assert.equal(calls, 2);
  assert.equal(await answerWithTools(h, 'org', 'pergunta', [], gen, new Set()), '');
  assert.equal(calls, 2);
});
