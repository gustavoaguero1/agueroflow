# Dados do WhatsApp separados por empresa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Contatos, conversas, canais de OCR, regras e registros de ND, comandos programados, respostas rápidas, regras e conversa do assistente e a configuração do WhatsApp passam a existir por empresa; cada empresa só vê e só automatiza o que é dela.

**Architecture:** Os 9 depósitos globais de `server.ts` (`whatsAppContacts`, `whatsAppMessages`, `whatsAppNdRules`, `whatsAppNdRecords`, `whatsAppScheduledJobs`, `whatsAppAiRules`, `whatsAppQuickReplies`, `whatsAppAiChat`, `whatsAppReceiptsConfig`) e o mapa de canais de OCR (`ocrEnabledLockMap`) viram **visões por empresa**: um `Proxy` que encaminha leitura e escrita para os dados da empresa do contexto (`orgOfWhatsAppContext()`, já usado pelo WhatsApp por usuário). O código que usa esses nomes continua igual; as poucas reatribuições (`x = ...`) viram `x$.set(...)`, e a gravação em disco grava todas as empresas, com `organizationId` em cada registro. Registros antigos sem empresa vão para a empresa padrão. Tarefas em segundo plano rodam uma vez por empresa.

**Tech Stack:** Node/Express, TypeScript, `node:test`.

**Spec:** pedido do usuário em 23/11/2026 ("separar por empresa os outros dados do WhatsApp"), decisões delegadas.

## Global Constraints

- Nenhuma função do WhatsApp pode parar; formato dos arquivos de dados continua lendo os antigos (lista simples ou objeto) sem perder nada.
- Registro sem `organizationId` → empresa padrão (`effectiveOrg(undefined)`).
- Uma empresa nunca lê nem altera dados de outra por estes depósitos.

## Review Focus

- Arquivo antigo (lista sem empresa) carrega tudo na empresa padrão e regrava com `organizationId` (Task 1/2).
- Tarefa em segundo plano (comandos programados, varredura de ND, resumo) roda para cada empresa, no número dela (Task 3).
- Requisição sem empresa (master sem empresa) continua vendo a empresa padrão, como antes (Task 2).
- `JSON.stringify`, espalhamento (`[...x]`), `for..of`, `filter/find/some/splice/push/unshift` e índice (`x[i] = ...`) na visão funcionam como num array normal (Task 1).
- Configuração de uma empresa nova nasce com os padrões, não com a configuração de outra empresa (Task 1).

---

### Task 1: Depósitos por empresa (genéricos)

**Files:** Create `server/orgScopedStore.ts`; Test `tests/orgScopedStore.test.ts`

**Interfaces:**
- `createOrgScopedArray<T extends object>(o: { orgOf: () => string; defaultOrg: string; initial: unknown }): { view: T[]; set(arr: T[]): void; all(): Array<T & { organizationId: string }>; orgs(): string[] }` — `initial` aceita lista (itens com/sem `organizationId`).
- `createOrgScopedObject<T extends object>(o: { orgOf; defaultOrg; defaults: () => T; initial: unknown }): { view: T; set(obj: T): void; all(): Record<string, T>; orgs(): string[] }` — `initial` aceita objeto simples (= empresa padrão) ou `{ __porEmpresa: Record<string, T> }`.
- `createOrgScopedMap<V>(o: { orgOf; defaultOrg; initial: Array<[string, V & { organizationId?: string }]> }): { view: Map<string, V>; all(): Array<[string, V & { organizationId: string }]>; orgs(): string[] }`.

- [ ] Testes (RED → GREEN): visão segue a empresa do contexto; push/unshift/splice/índice/filter/find/some/length/espalhar/for..of/JSON; `set` troca só a empresa atual; `all()` carimba `organizationId`; lista antiga vai para a padrão; objeto: empresa nova nasce com `defaults()`; mapa: get/set/has/delete/size/iterar por empresa.
- [ ] Commit.

### Task 2: Ligar os 10 depósitos no servidor

**Files:** Modify `server.ts` (declarações, reatribuições `x = ...` → `x$.set(...)`, funções `persist*` gravam `x$.all()`; config grava `{ __porEmpresa }`); Test `tests/whatsappStoresWiring.test.ts` (varre `server.ts`: nenhuma reatribuição direta dos 9 nomes; cada `persist*` usa `.all()`).

- [ ] RED → GREEN; `tsc`; suíte; boot real do servidor sem erro; commit.

### Task 3: Tarefas em segundo plano por empresa

**Files:** Modify `server.ts` (intervalos de comandos programados, varredura de ND 45 s, resumo semanal, varredura pós-reconexão); `server/whatsappRuntime.ts` (`forEachWhatsAppOrg(fn)` = empresas com dados ∪ empresas com WhatsApp, cada uma em `runAsOrgWhatsAppSender`); Test `tests/whatsappContext.test.ts`.

- [ ] RED (`forEachOrg` roda uma vez por empresa, no contexto dela) → GREEN; commit.

### Task 4: Verificação final

- [ ] `tsc`, `npm test`, `vite build`, boot real; revisão independente; PR.
