import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createWhatsAppBridge } from '../src/services/whatsappWebBridgeServer';

const tmp = (name: string) => fs.mkdtempSync(path.join(os.tmpdir(), `wa-${name}-`));

test('duas conexões são independentes: estado e credenciais de cada uma', () => {
  const dirA = tmp('a');
  const dirB = tmp('b');
  const a = createWhatsAppBridge({ key: 'u_a', authDir: path.join(dirA, 'auth'), stateFile: path.join(dirA, 'state.json') });
  const b = createWhatsAppBridge({ key: 'u_b', authDir: path.join(dirB, 'auth'), stateFile: path.join(dirB, 'state.json') });

  assert.equal(a.key, 'u_a');
  assert.equal(a.getWhatsAppBridgeStatus().state, 'desconectado');
  assert.equal(b.getWhatsAppBridgeStatus().state, 'desconectado');

  fs.mkdirSync(path.join(dirA, 'auth'), { recursive: true });
  fs.writeFileSync(path.join(dirA, 'auth', 'creds.json'), JSON.stringify({ registered: true, me: { id: '5511900000000:1@s.whatsapp.net' } }));
  assert.equal(a.hasPersistedBridgeSession(), true);
  assert.equal(b.hasPersistedBridgeSession(), false);
});
