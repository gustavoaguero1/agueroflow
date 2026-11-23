# Reembolsos v1: nota do WhatsApp até o resumo semanal (design aprovado em 23/11/2026)

## Por quê
Hoje, toda semana, alguém lê cada nota que os funcionários mandam no WhatsApp, digita numa planilha o valor, a categoria e a obra, desconta o vale-viagem, salva a nota na pasta da rede e lança no Protheus quanto cada um tem a receber. Objetivo: **saber toda semana quanto reembolsar a cada funcionário, sem digitação**.

## Escopo desta versão
- A nota recebida pelo WhatsApp (OCR já existente) passa a ter **funcionário identificado**, **obra** e **imagem guardada**.
- **Resumo semanal por funcionário:** no painel e em Excel, com aprovar em lote e marcar como reembolsado. Uma mensagem no WhatsApp para o dono toda **segunda às 08:00 (São Paulo)**.
- Remover o dado falso `OS-2025-042` e os nomes e telefones de exemplo do formulário de envio manual.

**Fora (em espera):** vale-viagem (futuro módulo de Operações), lançamento no Protheus, salvar a nota na pasta da rede (vai reaproveitar o agente das NDs, por data de emissão).

## Decisões (do dono: "tome a melhor decisão")
1. **Imagem da nota:** salva no Firestore em `receipt_images/{receiptId}` (`orgId`, `mimeType`, `base64`, `bytes`, `createdAt`), **pelo servidor**. O cliente lê por `GET /api/reembolsos/:id/imagem`, filtrado pela organização do usuário. Imagens com base64 acima de 900 KB não são salvas, e a nota ganha `imageStatus: 'grande_demais'`. Migrar para o Storage quando ele for ativado.
2. **Quem gastou:**
   - Novo campo opcional `whatsapp` no cadastro do funcionário de obra (`field_workers`), editável no formulário.
   - A correspondência é feita pelos últimos 10 ou 11 dígitos do telefone. Se não houver, tenta pelo nome normalizado do contato (sem acento e sem diferença de maiúsculas, só correspondência exata).
   - Se nada bater: `workerStatus: 'a_identificar'`.
3. **Obra:**
   - Primeiro, o apontamento `worker_time_logs` do funcionário na **data de emissão** (usa `contractId` e `siteName`).
   - Senão, `field_workers.currentSite`.
   - Senão, `obraStatus: 'a_definir'`. O painel deixa escolher a obra (contratos da organização) com um clique.
   - Guardar sempre a origem em `obraSource`: `'apontamento' | 'cadastro' | 'manual' | 'a_definir'`.
4. **Semana:** de segunda a domingo, pela **data de chegada** (`receivedAt`), em America/Sao_Paulo. O resumo de segunda cobre a semana anterior.
5. **Fluxo de status:** a nota entra `pendente`. O painel oferece **"aprovar pendentes da semana"** (Admin/Gerente) e **"marcar semana como reembolsada"** (`aprovado` → `reembolsado`, gravando `reimbursedAt` e `reimbursedBy`). O resumo mostra o total aprovado por funcionário e a contagem de pendentes.
6. **Mensagem de segunda:**
   - Vai para `OWNER_PHONE` pelo WhatsApp já conectado.
   - Leva o total geral, uma linha por funcionário (total aprovado, pendentes, obras) e um aviso de "obra a definir" ou "funcionário a identificar", se houver.
   - Envio único por semana, com marcador em `data_reembolso_resumo_enviado.json`. Se o WhatsApp estiver desconectado, tenta de novo na próxima checagem (a cada 10 minutos).

## Restrições
- O `server.ts` é editado em paralelo pelo AI Studio: lógica nova em `server/reembolsos.ts` (funções puras testadas e router), e só ligações pontuais no `server.ts`.
- Organização da nota: `effectiveOrg` como hoje. Firestore lido pelo Admin SDK; sem credencial, o enriquecimento é pulado sem quebrar o OCR.
- Interface em português, no estilo do `ReceiptReimbursementsView`, funcionando no celular.
