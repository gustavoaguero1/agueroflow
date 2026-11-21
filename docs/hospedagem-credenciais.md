# Guia de credenciais e go-live (para o dono do app)

Projeto: `gen-lang-client-0444631531`. Como ele é gerenciado pelo AI Studio, pode aparecer
cinza no console do Firebase. Use o **Google Cloud Console**, com a mesma conta Google do AI Studio.

**Regra de ouro:** nunca cole o JSON da chave no chat, em e-mail ou no GitHub. Só no campo de Secrets do AI Studio.

**Condição:** não cadastre uma segunda empresa (cliente) antes do projeto 2 - os dados do WhatsApp e das NDs ainda não estão separados por empresa.

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
   Quando `FIREBASE_SERVICE_ACCOUNT` está definida e é válida, o servidor usa ela antes da conta de serviço do Cloud Run (no diagnóstico, `admin.credential` mostra `service-account`).
4. Se o Google bloquear a criação de chaves (política da organização), use a Opção A.

## Passo 2 - Variáveis de ambiente (Secrets do AI Studio)

| Variável | Para que serve |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Chave do servidor (só na Opção B). |
| `MASTER_EMAILS` | E-mails dos administradores master, separados por vírgula. Por enquanto a tela do app só reconhece como master o **primeiro** e-mail (`gustavo@agueroinox.com.br`, fixo no código); os demais têm permissão de master no servidor, mas a interface não os trata como master. |
| `WEBHOOK_SECRET` | Senha longa e aleatória que protege os webhooks recebidos. |
| `WHATSAPP_VERIFY_TOKEN` | Mesmo texto configurado como "Verify token" na Meta (webhook do WhatsApp). O campo de token na tela de Configurações do app não tem mais efeito. |
| `WHATSAPP_API_KEY` | Chave de acesso à API do WhatsApp. |
| `OWNER_PHONE` | Seu telefone (com DDI, só números), dono do bot. |
| `AUTHORIZED_PHONES` | Telefones autorizados a falar com o bot, separados por vírgula. |
| `DEFAULT_ORG_ID` | ID da empresa Aguero. Veja na tela **Estrutura** do app ou na coleção `organizations` do Firestore (campo ID do documento). |
| `APP_URL` | Endereço público do app (usado nos links de primeiro acesso), sem barra no final. |
| `COMPOSIO_WEBHOOK_SECRET` | Obrigatório se você usa o webhook do Composio: segredo de assinatura dos webhooks. Sem ele o webhook do Composio fica desativado (responde 403). |

## Passo 3 - Máximo de instâncias = 1
Cloud Run -> serviço -> **Editar e implantar nova revisão** -> **Escalonamento automático** -> máximo de instâncias = **1**. Implante.

## Passo 4 - Notas fiscais automáticas da SEFAZ (certificado A1)

Com isso, toda NF-e emitida para o CNPJ da empresa aparece sozinha na Caixa de Notas. O servidor consulta a SEFAZ
(Distribuição DF-e) a cada poucos minutos e, quando a SEFAZ manda só o resumo de uma nota, registra a
**Ciência da Operação** para liberar o XML completo (é o evento oficial que diz "a empresa sabe que essa nota existe";
não aceita nem recusa a nota).

**Atenção: o certificado A1 é a assinatura legal da empresa.** Quem tem o arquivo e a senha assina documentos fiscais
em nome dela. Guarde-o **só** nos Secrets do AI Studio: nunca no chat, e-mail, WhatsApp, GitHub ou pasta compartilhada.

1. **Converta o .pfx para base64** (texto). Em um computador de confiança:
   - Windows (PowerShell): `[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\caminho\certificado.pfx")) | Set-Clipboard`
     (o texto vai para a área de transferência).
   - Mac/Linux (Terminal): `base64 -i certificado.pfx | tr -d '\n' | pbcopy` (Mac) ou `base64 -w0 certificado.pfx` (Linux).
2. No AI Studio, em **Secrets**, crie:

| Variável | Valor |
|---|---|
| `NFE_CERT_PFX_BASE64` | O texto copiado no item 1 (uma linha só). |
| `NFE_CERT_PASSWORD` | A senha do certificado. |
| `NFE_CNPJ` | CNPJ da empresa dona do certificado. |
| `NFE_UF` | Código IBGE da UF da empresa (SP = 35, RJ = 33, MG = 31, PR = 41, RS = 43, BA = 29). |
| `NFE_ORG_ID` | ID da empresa no app (mesmo tipo de valor de `DEFAULT_ORG_ID`). |
| `NFE_AMBIENTE` | Comece com `2` (homologação = ambiente de testes da SEFAZ). |

3. **Teste em homologação primeiro.** Publique, espere uns minutos e, logado como Admin, rode no console do navegador (F12):
   `fetch('/api/nfe/sync-status?orgId=<NFE_ORG_ID>').then(r=>r.json()).then(console.log)` (troque `<NFE_ORG_ID>` pelo ID;
   o token de acesso vai junto automaticamente, como no diagnóstico). Espere `configured: true` e um `lastStatus`
   começando com `137` (nada a retornar) ou `138` (documentos encontrados). Erros comuns:
   - `Certificado A1 inválido ou senha incorreta`: confira a senha e se o base64 foi colado inteiro.
   - `unable to get local issuer certificate`: avise o desenvolvedor (falta a cadeia ICP-Brasil em `NFE_CA_PEM`).
   - `656 Consumo indevido`: o servidor já espera 1 hora sozinho; não force novas buscas.
4. Com o teste OK, troque `NFE_AMBIENTE` para `1` (produção) e publique de novo. A primeira busca pode trazer as notas
   dos últimos 90 dias aos poucos (até 20 consultas a cada 5 minutos; quando não há mais nada, a SEFAZ pede 1 hora de intervalo).
5. Quando o certificado vencer (A1 vale 1 ano), gere o base64 do novo e substitua `NFE_CERT_PFX_BASE64` e `NFE_CERT_PASSWORD`.

O botão "Buscar na SEFAZ agora" (Admin/Gerente) respeita o mesmo intervalo: antes do horário permitido ele só informa
quando será a próxima busca.

## Ordem do go-live (não pule etapas)

1. Configure a credencial e as variáveis (acima).
2. Publique o código: faça o merge da branch em `main` e o AI Studio puxa/implanta.
3. **Diagnóstico:** abra o app já logado como master, abra o console do navegador (F12 -> Console) e rode:
   `fetch('/api/health').then(r=>r.json()).then(console.log)`
   Rode **no console da aba do app, logado como master** - o token de acesso vai junto automaticamente.
   Se `diagnostics` não aparecer na resposta, você não está logado como master ou o servidor está sem credencial: confira de novo o Passo 1.
   Confira que **todos** os itens de `diagnostics` estão `true`. Preencha a tabela abaixo.
   **Se o diagnóstico falhar depois de publicar o código, volte para a versão anterior** (Cloud Run -> serviço -> **Revisões** -> direcione 100% do tráfego para a revisão anterior). Enquanto o `/api` responde 503, quem entra com senha fica trancado para fora.
4. **ATENÇÃO: só publique as regras depois que a nova versão do app estiver no ar e o diagnóstico estiver todo `true`. Publicar as regras novas antes tranca todo mundo para fora do app antigo.** Só então publique as regras do Firestore:
   `npx firebase deploy --only firestore --config firebase.deploy.json --project gen-lang-client-0444631531`
   (o banco tem nome próprio, por isso o arquivo `firebase.deploy.json` em vez do `firebase.json`).
   Alternativa sem terminal: Cloud Console -> Firestore -> escolha exatamente o banco `ai-studio-agueroflowgestoo-fd1a8235-af5f-4faa-8f53-85d81fa6ae61` (confira o ID completo; não use o `(default)`) -> **Regras** -> cole o conteúdo de `firestore.rules` -> Publicar (mesmo aviso acima vale aqui). (Índices: o comando acima os publica; pelo console, crie-os manualmente se o app pedir.)
   Fotos de OS (Storage): ative o Firebase Storage no projeto e publique `npx firebase deploy --only storage --config firebase.deploy.json --project gen-lang-client-0444631531` (regras em `storage.rules`; sem isso o envio de fotos é negado).
5. Opcional: `npm run migrate:passwords` (precisa das credenciais do Passo 1 no ambiente). Converte senhas antigas em texto puro para hash e mostra só contagens. Sem isso, a conversão acontece sozinha no primeiro login de cada pessoa.
6. Para colaboradores sem senha: na tela **Estrutura**, gere o link de primeiro acesso e envie a cada um.
7. **Webhook do WhatsApp (comprovantes):** o webhook agora exige o `WEBHOOK_SECRET`. No painel do seu provedor (Evolution API, Z-API ou Meta), troque a URL do webhook para
   `https://<seu-app>/api/webhooks/whatsapp-receipts?token=<WEBHOOK_SECRET>`.
   Na Meta, o "Verify token" do webhook deve ser exatamente o valor de `WHATSAPP_VERIFY_TOKEN`. Sem isso os comprovantes deixam de chegar (o servidor responde 403).

## Resultado do diagnóstico

Preencher na etapa 3 (data: ______ ; host: ______________)

| Item de `diagnostics` | Esperado | Valor obtido | Observação |
|---|---|---|---|
| `admin.enabled` | true | | `admin.credential`: ______ |
| `firestoreRead` | true | | |
| `bucketWrite` | true | | |
| `customToken` | true | | |
| `defaultOrg` | true | | `DEFAULT_ORG_ID` definido e `organizations/<id>` existe |

Liberado para publicar as regras? ( ) sim ( ) não - assinado por: ____________
