# Acesso por área — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada pessoa tem, em cada área do sistema, "sem acesso", "ver" ou "editar". O perfil dá um padrão coerente; o Admin ajusta o padrão de cada perfil na empresa e, por pessoa, libera ou restringe áreas além do perfil. RH (salários) fechado para a maioria. Vale no menu, no servidor e nas regras do banco.

**Architecture:** Um catálogo único (`src/permissions/areas.ts`, puro, usado por navegador e servidor) define as áreas, as seções do menu de cada uma, os padrões por perfil e `resolveAreas()`. O nível resolvido de cada empresa vai no token de login (`areas: { [orgId]: { [area]: 0|1|2 } }`), montado em `buildClaims` a partir de `organizations/{org}.areaDefaults` e `org_members/{id}.areaAccess`. Regras do Firestore e um `requireArea()` no servidor leem o token. Operações deixa de ler salários: lê `rh_directory` (cópia sem salários, mantida pelo serviço do RH) e só lê `rh_employees` com acesso ao RH.

**Tech Stack:** React 19, Express, Firebase Auth custom claims, Firestore rules, `node:test`.

**Spec:** pedido do usuário (24/11/2026): "defina o acesso por área da maneira mais coerente para cada módulo; algo que todo mundo precisa ver; adaptável — essa área vai conseguir ver tal coisa além do que já vê; configurável"; antes: "RH é restrito pra maioria".

## Global Constraints

- Níveis: 0 sem acesso, 1 ver, 2 editar. Master sempre 2.
- Painel e Suporte: mínimo 1 para todos (não configurável abaixo disso).
- Token antigo (sem `areas`): RH só Admin/Gerente; demais áreas como antes.
- Nenhum módulo para de funcionar para quem tem acesso; Operações continua funcionando sem acesso ao RH (sem salários).

## Áreas e padrões (Admin / Gerente / Supervisor / Operacional / Visualizador)

| Área | Seções | Padrão |
|---|---|---|
| painel | painel | 2/2/1/1/1 (mín. 1) |
| operacoes | ordens, checklists, inspecoes, ocorrencias, operacoes, ops-*, obras, viagens-*, bens-* | 2/2/2/2/1 |
| estoque | pecas-servicos, estoque, compras | 2/2/2/1/1 |
| comercial | comercial-*, marketing | 2/2/1/0/1 |
| financeiro | financeiro-* | 2/2/2/0/0 (Supervisor: o perfil já limita a lançar e dar baixa) |
| rh | rh-* | 2/1/0/0/0 |
| whatsapp | whatsapp-* | 2/2/2/1/1 |
| relatorios | relatorios, ia | 2/2/1/0/1 |
| estrutura | estrutura-* | 2/2/1/1/1 |
| configuracoes | configuracoes | 2/1/0/0/0 |
| suporte | suporte | 2/2/2/2/2 (mín. 1) |

## Review Focus

- Pessoa com área restrita digita a seção na URL / estado salvo: não abre a tela (Task 5).
- Admin tira o próprio acesso a Configurações: bloqueado (sempre editar para Admin) (Task 1).
- Operacional sem RH abre Operações: vê pessoas, não vê salários, nenhuma tela quebra (Task 3).
- Mudança de acesso vale sem a pessoa sair e entrar de novo (token renovado) (Task 4/5).
- Token antigo sem `areas` não abre RH para Operacional (Task 4).

---

### Task 1: Catálogo e resolução
**Files:** Create `src/permissions/areas.ts`; Test `tests/areas.test.ts`
**Interfaces:** `AREA_IDS`, `type AreaId`, `type AreaLevel = 0|1|2`, `AREAS: Array<{ id; label; description; sections: string[] }>`, `ROLE_DEFAULTS: Record<UserRole, Record<AreaId, AreaLevel>>`, `resolveAreas(role, orgDefaults?, overrides?): Record<AreaId, AreaLevel>` (aplica mínimos; Admin sempre 2 em configuracoes), `areaOfSection(section: string): AreaId | null`.
- [ ] RED/GREEN: padrões da tabela; override por pessoa vence o da empresa, que vence o do perfil; mínimos; Admin config 2; seções `rh-funcionarios`→rh, `ops-diario`→operacoes, `viagens-painel`→operacoes, `painel`→painel, desconhecida→null.

### Task 2: Diretório de pessoas sem salários
**Files:** Modify `src/services/rhPayrollService.ts` (gravar `rh_directory/{id}` junto de `rh_employees`; `syncRhDirectory(orgId)` para preencher); `src/modules/operations/peopleSource.ts`, `diarioSync.ts`, `opsBridge.ts` (ler `rh_directory`; salários só com RH ≥ 1); Test `tests/rhDirectory.test.ts` (`toDirectoryEntry(emp)` não tem nenhum campo de salário/valor-hora).

### Task 3: Token com áreas + servidor
**Files:** Modify `server/authService.ts` (`orgClaims` inclui `areas`), `server/authMiddleware.ts` (`requireArea(area, level)`), `server.ts` (rotas `/api/rh*`, financeiro, configurações de equipe; `GET/PUT /api/org/areas` para padrões da empresa e `PUT /api/org/members/:id/areas`, que gravam e renovam o token da pessoa); Test `tests/areaClaims.test.ts`.

### Task 4: Regras do banco por área
**Files:** Modify `firestore.rules` (`areaLevel`, `areaOk`, mapa coleção→área: rh_* / hr_onboardings / rh_directory(leitura: operacoes ou rh) / ops_orgs salarios → rh; commercial_* → comercial; purchasing_* / items / item_categories / stock_* → estoque; finance_* / nfe_* → financeiro; whatsapp_* → whatsapp; work_orders, checklist_*, inspections, occurrences, construction_*, worker_time_logs, ops_orgs → operacoes); Test `tests/emulator/areaRules.test.ts`.

### Task 5: Navegador: menu, leitura e tela de permissões
**Files:** Modify `src/contexts/AuthContext.tsx` (`areaLevel(area)`, `canSeeSection(section)`; renova o token ao trocar de empresa e ao receber aviso de mudança), `src/components/layout/AppLayout.tsx` (filtra itens e subitens; selo "Somente leitura"), `src/App.tsx` (seção sem acesso → Painel); Create `src/components/settings/AreaAccessPanel.tsx` (padrões por perfil da empresa + ajuste por pessoa, mostrando o padrão herdado); Test `tests/areas.test.ts` (filtro do menu).

### Task 6: Verificação final
- [ ] `tsc`, `npm test`, `vite build`, boot real; revisão independente; PR.
