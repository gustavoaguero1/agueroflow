# WhatsApp com QR code por usuário — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada usuário conecta o próprio WhatsApp lendo o próprio QR code; nenhum número fica fixo para todos; o que chega por um WhatsApp fica marcado com quem recebeu e de qual empresa.

**Architecture:** O módulo `src/services/whatsappWebBridgeServer.ts` hoje guarda UMA conexão em variáveis do módulo. Ele vira uma fábrica `createWhatsAppBridge(cfg)` (o corpo do módulo vai para dentro da função; as variáveis viram estado de cada instância, sem mudar a lógica). Um registro (`whatsappSessions.ts`) mantém uma instância por chave de sessão (`u_<uid>`), com pasta de credenciais e arquivo de estado próprios. As rotas `/api/whatsapp/bridge/*` usam a sessão de quem chama. Os ganchos de mensagem recebida passam a receber o contexto da sessão (usuário e empresa). Automações da empresa (NDs, comandos programados, resumo semanal) enviam pelo **número oficial** da empresa, escolhido entre as sessões conectadas.

**Tech Stack:** Node/Express (`server.ts`), Baileys, React 19, Firebase Admin, testes `node:test` + `tsx`.

**Spec:** decisões do usuário em 23/11/2026: "cada um precisa ter um acesso no QR code, meu número não pode ser definitivo pra todos"; "Um QR por usuário"; demais decisões delegadas ("tome a melhor decisão por mim").

## Global Constraints

- Uma sessão por usuário (chave `u_<uid>` com só `[A-Za-z0-9_-]`); credenciais em `data_whatsapp_auth/<chave>/`, estado em `data_whatsapp_bridge_state/<chave>.json`.
- Limite de sessões abertas no servidor: `WA_MAX_SESSIONS` (padrão 20); acima disso, conectar responde 429 com mensagem clara.
- Sessão antiga (credenciais na raiz de `data_whatsapp_auth/`) é migrada para `data_whatsapp_auth/legacy/` e continua funcionando como sessão `legacy` da empresa padrão (`DEFAULT_ORG_ID`) até um Admin assumi-la ou desconectá-la.
- Nenhum número de telefone fixo no código de produção (placeholders genéricos, ex. "+55 11 90000-0000").
- Arquivos `data_whatsapp_*` e `.whatsapp_auth/` fora do git (`.gitignore`) e removidos do índice.
- Nenhuma função existente do WhatsApp (OCR de recibos, NDs, comandos, assistente, central de conversas) pode parar; o que hoje é global continua funcionando, só que marcado com sessão/empresa.

## Review Focus

- Servidor reinicia com várias sessões salvas: todas voltam sozinhas, cada uma com suas credenciais (Task 2).
- Usuário A desconecta: a sessão de B continua conectada e recebendo (Task 3).
- Empresa sem número oficial definido e sem sessão conectada: automação não envia e registra o motivo em vez de quebrar (Task 4).
- Mensagem recebida pela sessão `legacy`: recibo sai com a empresa padrão, não vazio (Task 4).
- Usuário sem empresa selecionada chama `/bridge/connect`: 400 com mensagem, nada é criado (Task 3).

---

### Task 1: Fábrica da conexão (sem mudar comportamento)

**Files:**
- Modify: `src/services/whatsappWebBridgeServer.ts`
- Test: `tests/whatsappBridgeFactory.test.ts`

**Interfaces:**
- Produces: `createWhatsAppBridge(cfg: { key: string; authDir: string; stateFile: string }): WhatsAppBridge` — objeto com os mesmos nomes das funções exportadas hoje (`startWhatsAppBridgeSession`, `stopWhatsAppBridgeSession`, `getWhatsAppBridgeStatus`, `sendMessageViaWhatsAppBridge`, …, `registerWhatsAppBridgeHooks`), mais `key`. `export type WhatsAppBridge = ReturnType<typeof createWhatsAppBridge>`.
- Os exports antigos continuam existindo como atalhos para uma instância padrão (`defaultBridge`) até a Task 3 trocar os chamadores; assim o servidor compila e funciona igual após esta task.

- [ ] Step 1: teste que cria duas instâncias com pastas temporárias diferentes e verifica: `getWhatsAppBridgeStatus()` de cada uma começa `desconectado`; `hasPersistedBridgeSession()` é independente (criar `creds.json` só na pasta de A → A true, B false).
- [ ] Step 2: rodar → falha (`createWhatsAppBridge` não existe).
- [ ] Step 3: mover o corpo do módulo para dentro de `createWhatsAppBridge` (constantes `AUTH_DIR`/`BRIDGE_STATE_FILE` viram `cfg.authDir`/`cfg.stateFile`); manter tipos e imports no topo.
- [ ] Step 4: teste passa; `npx tsc --noEmit` limpo; `npm test` verde.
- [ ] Step 5: commit `refactor(whatsapp): conexão vira fábrica (uma instância por sessão)`.

### Task 2: Registro de sessões + migração da sessão antiga

**Files:**
- Create: `server/whatsappSessions.ts`
- Test: `tests/whatsappSessions.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `sessionKeyForUser(uid: string): string` → `u_<uid saneado>`.
  - `createSessionRegistry(opts: { baseDir: string; maxSessions: number; factory?: typeof createWhatsAppBridge }): SessionRegistry` com
    - `get(key: string): WhatsAppBridge | undefined`
    - `ensure(key: string, meta: { orgId: string; uid: string | null }): WhatsAppBridge` (lança `Object.assign(new Error(...), { status: 429 })` acima do limite)
    - `meta(key): { orgId: string; uid: string | null } | undefined`; `list(): Array<{ key; orgId; uid }>`
    - `remove(key: string): Promise<void>` (para e apaga credenciais)
    - `restoreAll(): string[]` — lê `<baseDir>/sessions.json` (metadados) e recria as instâncias com credenciais salvas.
  - `migrateLegacyAuth(baseDir: string, defaultOrgId: string): boolean` — se houver `creds.json` na raiz, move tudo para `legacy/` e registra `legacy` → `{ orgId: defaultOrgId, uid: null }`.

- [ ] Step 1: testes (pasta temporária, `factory` falsa): chave saneada; `ensure` duas vezes devolve a mesma instância; limite → erro 429; `restoreAll` recria a partir de `sessions.json`; `migrateLegacyAuth` move `creds.json` e `app-state-*.json` para `legacy/` e não faz nada na segunda chamada.
- [ ] Step 2–4: RED, implementar, GREEN, suíte verde.
- [ ] Step 5: commit `feat(whatsapp): registro de sessões por usuário`.

### Task 3: Rotas da conexão por usuário + tela "Meu WhatsApp"

**Files:**
- Modify: `server.ts` (rotas `/api/whatsapp/bridge/*`, boot: `migrateLegacyAuth` + `restoreAll` + ganchos por instância)
- Create: `server/whatsappRouting.ts` (funções puras de escolha de sessão)
- Modify: tela da Central do WhatsApp (`src/components/commercial/WhatsAppBusinessHub.tsx`) — cartão "Meu WhatsApp" com QR/código de pareamento, status e desconectar, usando as rotas já existentes.
- Test: `tests/whatsappRouting.test.ts`

**Interfaces:**
- Produces: `sessionForRequest(req: { user?: { uid: string }; orgId?: string }, registry): { key: string; orgId: string } | { error: string; status: number }` — 401 sem usuário, 400 sem empresa.
- `GET /bridge/status`, `POST /bridge/connect|disconnect|send|catch-up|select-group`, `GET /bridge/groups|keepalive` operam na sessão de quem chama. `GET /api/whatsapp/bridge/sessions` (Admin/Gerente) lista as sessões da empresa (número, nome, status, usuário). `POST /api/whatsapp/bridge/sessions/legacy/claim` (Admin) passa a sessão `legacy` para quem chamou.

- [ ] Step 1: testes de `sessionForRequest` (sem usuário → 401; sem empresa → 400; ok → chave `u_<uid>`).
- [ ] Step 2–4: RED, implementar rotas e cartão, GREEN; smoke: duas sessões falsas, desconectar uma não mexe na outra.
- [ ] Step 5: commit `feat(whatsapp): cada usuário conecta o próprio WhatsApp`.

### Task 4: Mensagens recebidas com contexto + número oficial da empresa

**Files:**
- Modify: `server.ts` (ganchos de mensagem recebida; envios de ND, comandos programados, resumo semanal, respostas do assistente)
- Modify: `server/whatsappRouting.ts`
- Test: `tests/whatsappRouting.test.ts`

**Interfaces:**
- Produces: `pickOrgSender(orgId: string, sessions: Array<{ key; orgId; uid; connected: boolean }>, officialKey?: string): string | null` — o número oficial se conectado; senão a sessão conectada da empresa (preferindo `legacy`, depois a mais antiga); senão `null`.
- Configuração do número oficial: campo `officialSessionKey` em `data_whatsapp_config.json` por empresa (`orgs[orgId].officialSessionKey`), editável por Admin no cartão "Meu WhatsApp" ("Usar este número para avisos da empresa").
- Cada evento recebido carrega `{ sessionKey, orgId, uid }`; recibos criados por WhatsApp recebem `organizationId = orgId` da sessão e `receivedBySession = sessionKey`; contatos e mensagens gravados recebem `sessionKey`.
- Respostas a uma conversa saem pela mesma sessão que recebeu.

- [ ] Step 1: testes de `pickOrgSender` (oficial conectado; oficial caído → outra conectada da empresa; nenhuma → null; não escolhe sessão de outra empresa).
- [ ] Step 2–4: RED, implementar, GREEN; envio sem remetente registra log "Sem WhatsApp conectado para a empresa X".
- [ ] Step 5: commit `feat(whatsapp): mensagens marcadas por sessão e número oficial da empresa`.

### Task 5: Sem número fixo e sessões fora do git

**Files:**
- Modify: `src/modules/SettingsModule.tsx`, `src/components/travel/WhatsAppConfigModal.tsx`, `src/components/commercial/WhatsAppBusinessHub.tsx`, `src/components/travel/ReceiptReimbursementsView.tsx`
- Modify: `.gitignore`; `git rm --cached` dos `data_whatsapp_*` e `.whatsapp_auth`
- Test: `tests/noHardcodedPhone.test.ts`

- [ ] Step 1: teste que varre `src/` e `server*` e falha se achar o número do dono.
- [ ] Step 2: RED (4 arquivos).
- [ ] Step 3: trocar padrões por placeholder genérico e o número exibido pelo número conectado do usuário/empresa (status da sessão); botão "Usar +55…" sai.
- [ ] Step 4: GREEN; `git ls-files | grep data_whatsapp` vazio.
- [ ] Step 5: commit `chore(whatsapp): sem número fixo e sessões fora do git`.

### Task 6: Verificação final

- [ ] `npx tsc --noEmit`, `npm test`, `npx vite build`.
- [ ] Revisão independente da branch (superpowers:requesting-code-review) com o Review Focus.
- [ ] PR.

**Depois deste plano (próximo plano, separado):** separar por empresa/usuário os demais dados globais do WhatsApp (contatos, conversas, canais de OCR, regras e registros de ND, comandos programados, respostas rápidas, conversa do assistente), filtrando as telas por quem está logado.
