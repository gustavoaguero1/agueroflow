# Guia de credenciais e go-live (para o dono do app)

Projeto: `gen-lang-client-0444631531`. Como ele é gerenciado pelo AI Studio, pode aparecer
cinza no console do Firebase. Use o **Google Cloud Console**, com a mesma conta Google do AI Studio.

**Regra de ouro:** nunca cole o JSON da chave no chat, em e-mail ou no GitHub. Só no campo de Secrets do AI Studio.

## Passo 1 - Credencial do servidor

1. Abra https://console.cloud.google.com, entre com a conta do AI Studio e selecione o projeto `gen-lang-client-0444631531` (seletor no topo).
2. Se o projeto não aparecer aqui também, **pare e avise o desenvolvedor** (plano B: criar um projeto Firebase seu - trabalho futuro).

### Opção A (preferida): permissões para a conta de serviço do app
Vale se o app roda no Cloud Run do AI Studio.
1. Menu **Cloud Run** -> clique no serviço do app -> aba **Segurança** -> anote a **Conta de serviço** (e-mail terminado em `iam.gserviceaccount.com`).
2. Menu **IAM e administrador** -> **IAM** -> **Conceder acesso** -> cole esse e-mail e adicione os papéis:
   - `Cloud Datastore User`
   - `Storage Object Admin`
   - `Firebase Authentication Admin`
   - `Service Account Token Creator`
3. Salvar. Não é preciso criar chave.

### Opção B: chave JSON (se A não for possível)
1. **IAM e administrador** -> **Contas de serviço** -> **Criar conta de serviço** -> dê os 4 papéis acima.
2. Abra a conta criada -> aba **Chaves** -> **Adicionar chave** -> **JSON**. Um arquivo é baixado.
3. No AI Studio, em **Secrets**, crie `FIREBASE_SERVICE_ACCOUNT` e cole **o conteúdo inteiro** do arquivo. Depois apague o arquivo do computador.
4. Se o Google bloquear a criação de chaves (política da organização), use a Opção A.

## Passo 2 - Variáveis de ambiente (Secrets do AI Studio)

| Variável | Para que serve |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Chave do servidor (só na Opção B). |
| `MASTER_EMAILS` | E-mails dos administradores master, separados por vírgula. |
| `WEBHOOK_SECRET` | Senha longa e aleatória que protege os webhooks recebidos. |
| `WHATSAPP_VERIFY_TOKEN` | Texto que você também informa na Meta ao configurar o webhook do WhatsApp. |
| `WHATSAPP_API_KEY` | Chave de acesso à API do WhatsApp. |
| `OWNER_PHONE` | Seu telefone (com DDI, só números), dono do bot. |
| `AUTHORIZED_PHONES` | Telefones autorizados a falar com o bot, separados por vírgula. |
| `DEFAULT_ORG_ID` | ID da empresa Aguero. Veja na tela **Estrutura** do app ou na coleção `organizations` do Firestore (campo ID do documento). |
| `APP_URL` | Endereço público do app (usado nos links de primeiro acesso), sem barra no final. |
| `COMPOSIO_WEBHOOK_SECRET` | Opcional: senha dos webhooks do Composio. |

## Passo 3 - Máximo de instâncias = 1
Cloud Run -> serviço -> **Editar e implantar nova revisão** -> **Escalonamento automático** -> máximo de instâncias = **1**. Implante.

## Ordem do go-live (não pule etapas)

1. Configure a credencial e as variáveis (acima).
2. Publique o código: faça o merge da branch em `main` e o AI Studio puxa/implanta.
3. **Diagnóstico:** abra o app já logado como master, abra o console do navegador (F12 -> Console) e rode:
   `fetch('/api/health').then(r=>r.json()).then(console.log)`
   Rode **no console da aba do app, logado como master** - o token de acesso vai junto automaticamente.
   Se `diagnostics` não aparecer na resposta, você não está logado como master ou o servidor está sem credencial: confira de novo o Passo 1.
   Confira que **todos** os itens de `diagnostics` estão `true`. Preencha a tabela abaixo.
4. **ATENÇÃO: só publique as regras depois que a nova versão do app estiver no ar e o diagnóstico estiver todo `true`. Publicar as regras novas antes tranca todo mundo para fora do app antigo.** Só então publique as regras do Firestore:
   `npx firebase deploy --only firestore --config firebase.deploy.json --project gen-lang-client-0444631531`
   (o banco tem nome próprio, por isso o arquivo `firebase.deploy.json` em vez do `firebase.json`).
   Alternativa sem terminal: Cloud Console -> Firestore -> escolha exatamente o banco `ai-studio-agueroflowgestoo-fd1a8235-af5f-4faa-8f53-85d81fa6ae61` (confira o ID completo; não use o `(default)`) -> **Regras** -> cole o conteúdo de `firestore.rules` -> Publicar (mesmo aviso acima vale aqui). (Índices: o comando acima os publica; pelo console, crie-os manualmente se o app pedir.)
5. Opcional: `npm run migrate:passwords` (precisa das credenciais do Passo 1 no ambiente). Converte senhas antigas em texto puro para hash e mostra só contagens. Sem isso, a conversão acontece sozinha no primeiro login de cada pessoa.
6. Para colaboradores sem senha: na tela **Estrutura**, gere o link de primeiro acesso e envie a cada um.

## Resultado do diagnóstico

Preencher na etapa 3 (data: ______ ; host: ______________)

| Item de `diagnostics` | Esperado | Valor obtido | Observação |
|---|---|---|---|
| `admin` | true | | |
| `firestoreRead` | true | | |
| `bucketWrite` | true | | |
| `customToken` | true | | |

Liberado para publicar as regras? ( ) sim ( ) não - assinado por: ____________
