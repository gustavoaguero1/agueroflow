# Fundação de Segurança — design

Data: 20/11/2026 · Projeto 1 de 6 (ver `docs/superpowers/analise/2026-11-20-auditoria-modulos.md`, seção 24)

## Intenção

O AgueroFlow vai ser hospedado para a equipe da Aguero usar no dia a dia (e talvez vendido a outras empresas depois). Hoje qualquer pessoa com a URL do app lê e altera todos os dados (salários, CPFs, OS, senhas) e usa o WhatsApp da empresa. Este projeto fecha isso **sem quebrar nenhuma funcionalidade existente**, e cria a base (servidor com acesso ao Firebase) de que os projetos seguintes dependem.

## Objetivos
1. Ninguém acessa dados sem login real; cada usuário só acessa os dados das empresas das quais é membro ativo (o master acessa todas).
2. Senhas nunca mais legíveis: guardadas só como hash, apenas no servidor.
3. Toda rota `/api` exige login, exceto uma lista explícita de rotas públicas, que têm sua própria proteção.
4. O estado do servidor (`data_*.json`, sessão do WhatsApp, PDFs de ND, tokens Outlook, admissões) sobrevive a reinícios **sem estar no git**.
5. O histórico do git deixa de conter credenciais, mensagens, contatos e PDFs.
6. Segredos e telefones fixos no código passam para variáveis de ambiente.

## Não-objetivos (ficam para projetos seguintes)
- Remover dados fictícios/demo, unificar cadastros de pessoa, padronizar `orgId` nos documentos.
- Mover os `data_*.json` para coleções estruturadas do Firestore (aqui só ganham persistência em arquivo remoto).
- WhatsApp por usuário / API oficial / agente com ferramentas.
- Refazer o fluxo de admissão (só fechamos as rotas dele).
- RBAC fino por coleção (aqui: membro da org pode ler/escrever os dados da org; papéis aplicados só em ações sensíveis do servidor).

## Anti-objetivos (seria fracasso mesmo "funcionando")
- Algum usuário atual ficar sem conseguir entrar, ou ter que redefinir senha.
- Alguma tela parar de carregar porque a regra nova bloqueou uma coleção que ela usa.
- O WhatsApp desconectar a cada reinício do servidor.
- Exigir que o AI Studio pare de ser usado.

## Restrições
- **Edição em paralelo com o Google AI Studio.** Mudanças pequenas, preferindo arquivos novos; tocar o mínimo em `server.ts` e `AuthContext.tsx`. Trabalho na branch `claude/epic-gates-86iss1`, juntado à `main` pelo dono.
- **Hospedagem indefinida** (Cloud Run do AI Studio ou Google Cloud próprio). O servidor usa as credenciais padrão do ambiente (ADC) e, se não houver, a variável `FIREBASE_SERVICE_ACCOUNT` (JSON). Sem credencial: o servidor sobe, avisa no log e funciona como hoje (modo desenvolvimento local), mas rotas protegidas respondem 503.
- Projeto Firebase: `gen-lang-client-0444631531`, banco Firestore **nomeado** (`firestoreDatabaseId` em `firebase-applet-config.json`), bucket `gen-lang-client-0444631531.firebasestorage.app`.
- O login por **nome ou e-mail + empresa** e o fluxo de "primeiro acesso" (definir senha) devem continuar existindo.
- Documentos usam `orgId` ou `organizationId` (inconsistente) — as regras precisam aceitar os dois.

## Abordagens consideradas
- **A. Firebase Auth real + servidor verificando o token (escolhida).** O usuário passa a ter identidade real no Firebase; regras e servidor confiam nela.
- B. Manter o login caseiro com validação no servidor — mais código próprio, sem ganho sobre A.
- C. Todo dado passando pelo servidor, banco fechado — reescrever ~116 mil linhas, inviável com o AI Studio editando junto.

O dono escolheu A.

## Design

### 1. Servidor com acesso ao Firebase (`firebase-admin`)
- Novo módulo `server/firebaseAdmin.ts`: inicializa o Admin SDK (ADC → `FIREBASE_SERVICE_ACCOUNT` → desligado), exporta `adminAuth`, `adminDb` (com o `firestoreDatabaseId` do config) e `adminBucket`.

### 2. Login
- **Google:** continua via `signInWithPopup` (já é Firebase Auth real).
- **Nome/e-mail + senha (decisão do construtor, ver "Chamadas feitas"):** a tela continua a mesma, mas a verificação vai para o servidor:
  - `POST /api/auth/credential-login {nameOrEmail, password, company?}` → servidor localiza o membro (Admin SDK), confere a senha e devolve um **custom token**; o cliente faz `signInWithCustomToken`. O UID do Firebase do membro é `member_<memberId>` (estável).
  - **Migração transparente:** se o membro ainda tem `passwordHash` em texto puro em `org_members`, o servidor compara, grava o hash (scrypt nativo do Node) em `member_credentials/{memberId}` (coleção que as regras negam a todos) e apaga o campo `passwordHash` de `org_members`. Senha certa = entra, e a partir daí já está migrado.
  - Primeiro acesso / troca de senha e criação de usuário com senha (`StructureModule`) passam a chamar `POST /api/auth/set-password` (exige token: o próprio membro no primeiro acesso via token de convite, ou Admin/Gerente da mesma org).
  - Script único `npm run migrate:passwords` faz a migração de todos de uma vez (rodado pelo dono depois do deploy); o caminho transparente cobre quem não for migrado.
- **Master:** e-mails em `MASTER_EMAILS` (env), padrão o e-mail atual — mantém o comportamento.

### 3. Quem é membro de quê (claims)
- Após qualquer login, o cliente chama `POST /api/auth/session`. O servidor lê `org_members` do usuário (por `userId`/e-mail, membro ativo) e grava **custom claims** `{ master: bool, orgs: { [orgId]: role } }`; o cliente força refresh do token.
- Alteração de membros (convidar, desativar, trocar papel) chama de novo o endpoint de claims daquele usuário (`POST /api/auth/refresh-claims/:memberId`, Admin/Gerente).
- Dono do dado = `orgId` ou, na falta, `organizationId` do documento.

### 4. Regras do Firestore
- Funções: `isMaster()`, `orgOf(data)` (`orgId` → `organizationId`), `isMemberOf(org)` via `request.auth.token.orgs[org]`, `canAccess(data)`.
- Padrão para coleções com dono: `read/update/delete` se `canAccess(resource.data)`; `create` se `canAccess(request.resource.data)`; update não pode trocar o dono.
- Mantém as imutabilidades atuais (`order_events`, `stock_movements`, `audit_logs`).
- Casos especiais definidos pelo inventário (passo do plano): `organizations/{orgId}` (dono = id do doc), `org_members` (membro lê os da sua org; escrita só Admin/Gerente; campos de senha proibidos), `users`, `system_security`, `trusted_devices`, coleções sem campo de org.
- `member_credentials`: negado a todos (só Admin SDK).
- **Fim do curinga** `isSignedIn()` para coleções não listadas: tudo não listado é negado.
- **Inventário obrigatório antes de fechar:** para cada uma das ~56 coleções usadas em `src/`, registrar qual campo de org seus documentos usam, conferindo nos `addDoc/setDoc` do código. Coleção cujos documentos não têm campo de org recebe regra específica ou correção pontual na gravação.
- Testes de regras com o emulador do Firestore (`@firebase/rules-unit-testing`): acesso negado sem login, negado a outra org, permitido ao membro, permitido ao master, `member_credentials` sempre negado.

### 5. Rotas `/api`
- Novo `server/authMiddleware.ts`: `requireAuth` (verifica o ID token do header `Authorization: Bearer`, coloca `req.user = {uid, master, orgs}`) e `requireRole(...)`.
- Aplicado uma vez em `server.ts` como `app.use('/api', ...)` **antes** das rotas, com uma lista de exceções públicas:
  - `/api/health`, `/api/auth/credential-login`
  - `/api/hr/onboarding/check/:token`, `/api/hr/onboarding/submit` (protegidas pelo token do convite, já existentes)
  - `/api/leads/demo` (landing page; manter rate limit)
  - `/api/outlook/oauth/callback` (protegida pelo `state` do OAuth)
  - Webhooks `/api/composio/whatsapp/webhook`, `/api/webhooks/whatsapp-receipts` — **assinatura/token passam a ser obrigatórios** (hoje só rejeitam se vier errado).
- Ações sensíveis com `requireRole('Admin','Gerente')` ou master: config do WhatsApp, conectar/desconectar bridge, enviar mensagem avulsa, onboarding `list/status/delete/generate-link`, reembolsos `update-status/delete/clear-mock`, Outlook connect/disconnect. As rotas de onboarding passam a usar a org do token (não do corpo/query).
- `GET /api/whatsapp/config` deixa de devolver `apiKey`/`verifyToken` (mascarados).
- Rate limit da IA passa a usar o `uid` em vez de IP.
- **Cliente:** novo `src/apiAuthFetch.ts`, importado uma vez em `main.tsx`, envolve `window.fetch` e anexa o ID token atual em toda chamada para `/api/*` do mesmo domínio. Nenhuma das ~40 chamadas existentes precisa mudar.

### 6. Persistência do estado do servidor (fora do git)
- Novo `server/stateSync.ts`: ao iniciar, baixa do bucket o prefixo `server-state/` para os caminhos locais (`data_*.json`, `data_whatsapp_auth/`, `data_nd_pdfs/`, `data_outlook_oauth_tokens.json`, `data_hr_onboardings.json`, `data_receipts*.json`) **antes** de o resto do servidor ler esses arquivos; depois observa essas pastas (`fs.watch`) e envia cada arquivo alterado (com atraso curto para agrupar escritas). Em `SIGTERM`, envia o que estiver pendente.
- Sem credencial/bucket: não faz nada (comportamento de hoje).
- Nenhum código existente que lê/grava esses arquivos precisa mudar.
- Primeira carga: o próprio servidor envia ao bucket o que existir localmente se o bucket estiver vazio (para não perder a sessão atual na transição).

### 7. Git e segredos
- `.gitignore` passa a cobrir `data_*`, `data_whatsapp_auth/`, `data_nd_pdfs/`, `.whatsapp_auth/`.
- Telefones, `verifyToken` padrão (`aguero_reembolsos_token_2025`), `apiKey: 'mude-me'` e o fallback do número do dono saem do código para variáveis de ambiente (documentadas no `.env.example`), mantendo os valores atuais como configuração do ambiente da Aguero — não no código.
- **Reescrita do histórico** (autorizada pelo dono): `git filter-repo` removendo esses caminhos de todos os commits e branches, seguido de force-push. **Feita por último**, depois que a persistência no bucket estiver validada, e **combinada com o dono** no momento (o AI Studio precisa puxar a nova história antes de editar de novo; se ele enviar a cópia antiga, os arquivos voltam).
- Depois da reescrita, recomendação ao dono: desconectar o aparelho no WhatsApp e escanear o QR uma vez (credenciais vazadas ficam inválidas; a nova sessão fica só no bucket).

### 8. Ordem de entrega (cada passo deixa o app funcionando)
1. Admin SDK + persistência no bucket (sem mudar comportamento).
2. Login: endpoints de auth + claims + migração transparente; cliente usando custom token e `apiAuthFetch`.
3. Middleware nas rotas `/api` + webhooks obrigatórios + segredos para env.
4. Inventário de coleções + novas regras do Firestore + testes no emulador.
5. `.gitignore` + remoção dos arquivos do índice; por fim, reescrita do histórico (combinada).

Os passos 2–4 só são publicados juntos (regras fechadas sem login real quebrariam o app).

## Decisões após a revisão do construtor

**Do dono:**
- **Master:** entra por Google (`MASTER_EMAILS`) **ou** senha própria. As 7 senhas fixas no código (`admin123`, `123456`, `aguero`…) e o comportamento "doc ausente = qualquer senha vale" são **removidos**. A senha atual em `system_security/master_auth` é migrada para hash em `member_credentials/__master__` no primeiro login correto; se não houver senha salva, o master entra só por Google até definir uma pelo app. UID do master por senha = UID da conta Google do e-mail master, se existir; senão `master_<email-hash>`.
- **Primeiro acesso:** só por **link de primeiro acesso** gerado por Admin/Gerente (token único, expira em 7 dias, uso único; enviado por WhatsApp `wa.me`/cópia, como o link de admissão). Sem link, um membro sem senha não consegue definir senha. Membros que já têm senha não são afetados. Membros pendentes hoje: o admin gera o link para cada um (a tela de usuários mostra quem está pendente).
- **Credencial do servidor:** o dono usa só o AI Studio e não sabe se tem acesso ao Google Cloud Console. **Portão no plano:** antes de publicar os passos 2–4, um endpoint de diagnóstico (`/api/health` estendido, só com master) confirma que o servidor consegue ler o Firestore, gravar no bucket e emitir custom token. Escrevo um guia passo a passo (`docs/hospedagem-credenciais.md`) para obter a credencial a partir do AI Studio/Console. Sem o diagnóstico verde, nada de segurança vai ao ar.

**Minhas (corrigíveis):**
- **Webhooks:** o provedor ativo é o Baileys (`provider: baileys_web_bridge`; Composio sem conta conectada). Os dois webhooks passam a exigir o segredo `WEBHOOK_SECRET` (query `?token=` ou header `x-webhook-token`); Composio exige assinatura quando `COMPOSIO_WEBHOOK_SECRET` existir e, sem ele, fica desligado. Não corta o recebimento atual, que vem pelo Baileys.
- **Uma instância:** requisito de hospedagem documentado (máx. 1 instância, sem sobreposição longa no deploy), pois o Baileys já não suporta duas. O `stateSync` grava com precondição de geração do objeto e registra conflito no log, em vez de tratar concorrência.
- **UID de quem entra por senha:** o custom token usa o `member.userId` já existente (Google UID ou `usr_...`); `member_<memberId>` só para quem não tem. Mantém `trusted_devices` e evita identidade dupla.

## Chamadas feitas por mim (o dono pode corrigir)
- Login por senha via **custom token** emitido pelo servidor, em vez do provedor "e-mail/senha" do Firebase: preserva o login por **nome** e por empresa, não depende de habilitar provedor no console do projeto do AI Studio, e mantém a senha só no servidor.
- Hash com **scrypt nativo do Node** (sem dependência nova).
- Permissão por **claims** no token (rápido, sem leituras extras nas regras); limite: membro novo só ganha acesso após o refresh de claims (o app já chama isso no login).
- Neste projeto, todo membro ativo de uma org lê/grava os dados dela; restrições por papel ficam nas ações sensíveis do servidor. RBAC por coleção fica para depois.
- Estado do servidor em **arquivos no Cloud Storage** (cópia fiel dos arquivos de hoje), não em coleções — mudança mínima; a estruturação fica para o projeto 2.

## Deixado para o construtor
- Lista exata de coleções e campo de org de cada uma (inventário).
- Nomes finais de arquivos/funções, intervalo do debounce do sync, formato dos logs.
- Como rodar o emulador nos testes (scripts npm).
