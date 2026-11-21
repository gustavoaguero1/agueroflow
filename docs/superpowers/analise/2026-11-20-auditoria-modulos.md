# Auditoria do AgueroFlow — módulos x mercado (20/11/2026)

Leitura do código de todos os módulos + comparação com sistemas de referência (Sienge, Orçafascio, Procore, SAP PM, Auvo, Produttivo, Senior/Gupy/TOTVS Admissão, Pontotel, Sólides, Omie/Bling, Onfly/Paytrack, dataEPI). Somente leitura — nada foi alterado no código.

Legenda de prioridade: **ALTA** (bloqueia uso real ou gera risco), **MÉDIA** (diferencial operacional), **BAIXA** (refinamento).

---

## 0. Diagnóstico geral (vale para o app inteiro)

### 0.1 Segurança — resolver antes de hospedar para qualquer usuário
| # | Problema | Evidência |
|---|---|---|
| 1 | Banco aberto: 55 regras `if true` no Firestore (usuários, OS, RH, salários, CPFs, estoque, patrimônio). Qualquer pessoa com a URL do app lê e escreve tudo, de todas as empresas. Coleções sem regra (comercial, viagens) caem num coringa "qualquer logado". | `firestore.rules:41-42`, `:76-242`, `:306` |
| 2 | Senhas em texto puro em `org_members` (que é público) e login conferido no navegador; o usuário "logado" é sintético, sem Firebase Auth. | `src/contexts/AuthContext.tsx:718, 807, 1034, 1046` · `StructureModule.tsx:374` |
| 3 | 104 rotas `/api` sem autenticação: qualquer um envia WhatsApp pelo número da empresa, lê a config com chaves, lista CPF/RG/banco/documentos de candidatos, aprova/apaga reembolsos, consome a cota do Gemini. | `server.ts:693, 3728, 3736, 3751-3870, 4997, 7754` |
| 4 | Sessão do WhatsApp, mensagens, contatos e PDFs de ND commitados no git. Telefones e tokens fixos no código. | `data_whatsapp_auth/`, `data_*.json`, `server.ts:1904, 3900+, 9221` |
| 5 | Webhooks aceitam requisição sem token/assinatura. | `server.ts:3937, 5164` |

### 0.2 Arquitetura
- **Estado em arquivo local** (`data_*.json`, sessão Baileys, tokens Outlook, admissões, reembolsos) + agendador em `setInterval`. No Cloud Run o disco é efêmero e pode haver várias instâncias → dados somem, jobs duplicam ou param.
- **Servidor não acessa o Firestore** (sem firebase-admin): nenhuma automação no servidor consegue ler/agir sobre OS, estoque, RH etc.
- **Módulos são silos**: cada um fala direto com o Firestore, sem camada compartilhada nem eventos. Campo de empresa inconsistente (`orgId` vs `organizationId`) já causa bug (assistente de IA não enxerga patrimônio).
- **Três cadastros de pessoa** (`rh_employees`, `field_workers`, `collective_asset_workers`), sincronizados pelo **nome**.
- **Dois catálogos de material** (`items` e `commercial_materials`).
- **Dados fictícios em produção**: seeds automáticos, botões "Exemplo Real", conteúdo de um cliente específico (Tetra Pak, CD Marília/MGR) fixo no código.

### 0.3 Mapa de integrações — como deveria ser vs hoje
```
Proposta GANHA ──► Obra/Contrato ──► OS ──► Apontamento HH ──► Folha (variáveis)
      │  (orçamento congelado = linha de base)  │        │
      ▼                                        ▼        ▼
  BOM ──► Requisição ──► Pedido ──► Recebimento/NF-e ──► Estoque da obra ──► baixa na OS
                                                                    │
Pessoa (cadastro único, CPF) ── NR/ASO/integração válidos? ──► pode ser alocada em OS/viagem
      │                                                             │
      └─► EPI (ficha NR-6) / Ferramenta (checkout)                  ▼
Viagens/Despesas de campo/ND ────────────────────────────► custo realizado da obra
                                                                    │
                                     Relatório "Resultado por Obra": orçado x realizado, margem
```
Hoje **nenhuma** dessas setas existe de ponta a ponta. Existe apenas: saída de estoque com referência (sem valor) a uma OS; ocorrência → OS corretiva; composição de custos ↔ proposta.

---

## 1. Ordens de Serviço (OS) e execução em campo

**O que funciona:** CRUD com status configuráveis, kanban, linha do tempo e auditoria, planejamento (serviços/MO/peças), aba de diálogo, GPS real, assinaturas do técnico e do cliente, relatório impresso.

**Incompleto/simulado**
- GPS: se o técnico negar permissão, grava coordenadas fixas de Marília como se fossem reais (`OrderExecutionHubTab.tsx:145-160`).
- Fotos antes/depois são URLs fixas do Unsplash; não há upload (`:201-235`).
- Assinatura em base64 dentro do documento (limite 1 MB), sem hash/CPF/horário confiável.
- Checklist do template escolhido na criação é descartado (`WorkOrdersModule.tsx:573-599`).
- Nenhuma regra de transição: dá para concluir sem checklist, fotos ou assinaturas.
- Botão "Aprovar Reserva" visível para qualquer um (`canApprove` fixo `true`, `:2240`).
- Horas reais = horas estimadas; peças em texto livre, sem vínculo com estoque.
- Numeração manual ou baseada em `length` → colisão.

**Mercado:** Auvo/Produttivo/Checkmob (check-in por GPS, foto com carimbo, offline), SAP PM (confirmação de horas por operação; OS só fecha com tudo confirmado), GAP/APR-PTe (Permissão de Trabalho digital que bloqueia pessoal com NR vencida).

**Recomendações**
- ALTA: remover GPS falso, fotos fixas e textos do cenário demo; upload real de fotos (Storage) com data/hora/GPS.
- ALTA: **APR/PT digital** (NR-10/33/35/trabalho a quente) assinada antes de iniciar; só alocar pessoa com NR/ASO/integração válidos.
- ALTA: regras de transição (concluir exige checklist obrigatório + fotos + assinaturas); permissão real de aprovação.
- MÉDIA: apontamento de HH por OS e por pessoa → custo realizado; peças vindas do estoque com reserva/baixa; requisição automática quando faltar material.
- MÉDIA: numeração sequencial única; modo offline (PWA + cache do Firestore) — essencial em planta de cliente sem sinal.
- BAIXA: OS alimentando o RDO; boletim de medição a partir das OS validadas; pesquisa de satisfação.

## 2. OS Recorrentes
- Geração só manual, `nextRunDate` nunca avança, sem pausa, sem checklist/materiais padrão.
- MÉDIA: agendador no servidor; planos por ativo/contrato (ex.: parada programada).

## 3. Checklists
- Só sim/não, número e texto aparecem na tela (foto, assinatura, múltipla escolha não). Progresso fixo em 100%, obrigatórios não validados, execução não grava a OS.
- ALTA: renderizar todos os tipos, validar obrigatórios, vincular à OS. MÉDIA: item não conforme gera ocorrência; versionamento de template.

## 4. Inspeções
- Nascem "concluídas"; sem fotos, instrumento ou checklist.
- MÉDIA: inspeções de montagem — dimensional, END (LP/PM/US), teste hidrostático, torque, alinhamento, **mapa/registro de juntas soldadas** (soldador, sinete, EPS, resultado), com certificado do instrumento.

## 5. Ocorrências
- Bom: Ishikawa + 5 Porquês, conversão em OS corretiva.
- MÉDIA: classificação SMS (incidente, quase-acidente, acidente com/sem afastamento, CAT), plano 5W2H com verificação de eficácia, vínculo com o trabalhador.

## 6. Aprovações LPU
- Número da OS em texto livre; itens não vêm de tabela; alçada de Configurações ignorada; aprovação não altera nada.
- MÉDIA: LPU por contrato/cliente com vigência e reajuste → base do boletim de medição.

## 7. Painel inicial (Dashboard)
- **Bug:** conta status antigos (`rascunho`, `planejada`, `concluida`…) que não existem mais — "Concluídas/Planejadas" ficam em 0 (`DashboardModule.tsx:275-281`). Horas reais e custo realizado nunca são gravados.
- ALTA: usar os status configurados (`isCompleted`).

---

## 8. Comercial (propostas)

**O que funciona:** 7 coleções reais, importação de BOM com casamento no catálogo (exato/comparável/equivalente), leitura de cotação de fornecedor por IA (PDF/imagem/Word/Excel), aprovação interna, PDF ao cliente.

**Incompleto/simulado**
- Preço = custo × (1+markup) + frete + imposto, sem BDI.
- "Serviço de Montagem" no assistente = só logística com valores fixos (R$ 480/1.680/1.900/350); equipe e dias nem entram no cálculo.
- Sem funil: não há "enviada/negociação/ganha/perdida", motivo de perda, probabilidade, revisão Rev.0/Rev.1.
- Benchmark de mercado com preços inventados pela IA ou fixos.

**Mercado:** Ploomes / RD Station CRM (funil, propostas com versão e rastreio), Procore (estimativa → orçamento da obra).

**Recomendações**
- ALTA: ciclo comercial real; **proposta ganha cria Obra/Contrato + OS** levando a composição congelada como orçamento base.
- MÉDIA: revisões com comparação; rastreio de visualização e aceite digital.

## 9. Composição de Custos (18 áreas)

**O que funciona:** modelo bem pensado para montagem (HE 50/100, periculosidade, insalubridade, noturno, mobilização/desmobilização, END, tratamento térmico, canteiro, ART, BDI por dentro, custo financeiro, 3 cenários, revisões, Excel/PDF).

**Problemas graves**
- **Custo de mão de obra digitado**, não calculado (`CostCompositionEditor.tsx:1734`). Encargos 72,5% só exibidos.
- **Dados da Tetra Pak fixos no código** (aba 18 com R$ 639.096,43 e R$ 293.640,00; template "Ref. Tetrapak") (`budget18AreasEngine.ts:1003-1008`).
- `issPercent || 5.0` impede ISS zero; PIS/COFINS fixos; sem Simples, CPRB, retenção de 11% INSS, CBS/IBS (transição 2026-27).
- Contingência 5% aplicada em silêncio; fallback para localStorage sem aviso; dois motores de cálculo duplicados; hook `useBudget18Areas` sem uso.
- Sem índices de produtividade nem CPU (insumo × coeficiente).

**Mercado:** Orçafascio / Sienge (CPU, tabela de encargos horista/mensalista, curva ABC, versões), Prevision (orçado × comprometido × realizado).

**Recomendações**
- ALTA: calcular MO = salário/220 × (1+adicionais) × (h normais + 1,5·HE50 + 2·HE100 + noturno) × (1+encargos) + benefícios, com tabela vinda do RH/convenção.
- ALTA: remover Tetra Pak e corrigir padrões tributários; regime tributário real.
- MÉDIA: **índices de produtividade de montagem** (HH/pol-diâmetro soldada, HH/kg caldeiraria, HH/t estrutura, HH/m tubulação) com fatores de dificuldade (altura, área classificada, parada); curva ABC.
- MÉDIA: BOM aprovada → requisições de compra; hospedagem/alimentação = pessoas × dias × diária.
- BAIXA: unificar motores e catálogos; modelar içamento (guindaste por capacidade/período, rigging, andaimes).

## 10. Itens e Serviços
- CRUD real, mas é um catálogo separado do comercial. BAIXA: unificar.

---

## 11. Compras

**O que funciona:** RC → mapa de cotação (3 propostas) → homologação → OC com PDF; recebimento parcial/total; campos de rastreabilidade (corrida, certificado de material).

**Incompleto/simulado**
- Seed de dados demo gravado automaticamente quando não há fornecedor.
- "Economia" e benchmark (LME, PTAX) inventados pela IA ou fixos (R$ 384.500, 9,8%).
- Sem importação de XML de NF-e; sem alçada de aprovação (regra das 3 propostas é só texto).
- Itens e centro de custo em texto livre; dois componentes de cotação duplicados.

**Mercado:** Sienge Construcompras (alçadas, app de aprovação), Omie/Bling (XML de NF-e gera estoque e contas a pagar).

**Recomendações**
- ALTA: recebimento dá **entrada no estoque** (central ou da obra); importar XML NF-e casando com a OC; remover seed e benchmark inventado.
- MÉDIA: alçada por valor × centro de custo; RC nascendo da OS/BOM.
- BAIXA: unificar cotação; usar o leitor de PDF de cotação que já existe no Comercial.

## 12. Estoque
- **Bug:** transferência só debita a origem — material some (`StockModule.tsx:125-131`).
- **Bug:** sem transação → duas saídas simultâneas furam o saldo.
- Ajuste sem motivo/aprovação; sem almoxarifado de obra, custo médio, lote/validade, ponto de pedido.
- ALTA: transação + transferência origem→destino ("em trânsito"); almoxarifado por obra; saída valorizada apropriada à OS.
- MÉDIA: ponto de pedido gera RC; lote/validade (eletrodo, EPI). BAIXA: curva ABC, inventário com QR.

## 13. Patrimônio / Ferramentas (Bens Coletivos) — o módulo mais sólido
- Retirada/devolução em transação, calibração/manutenção por categoria, certificados, CSV.
- Bloqueio por calibração vencida só na tela (transação lê mas não aplica). Anexos só metadados. Trabalhadores em cadastro paralelo.
- **Não existe EPI**: sem CA, validade do CA, vida útil, ficha NR-6 por trabalhador.
- ALTA: aplicar bloqueio no servidor/transação; **ficha de EPI digital** ligada ao RH (CA + validade, entrega baixa estoque, assinatura) — ref. dataEPI, OnSafety.
- MÉDIA: QR code por bem; upload real de certificados; unificar com cadastro de pessoas. BAIXA: custo interno de equipamento por dia na obra.

---

## 14. RH / Folha
- Calcula **apenas o 13º**. Não há folha mensal, IRRF, FGTS, férias, rescisão, eSocial ("Válido para eSocial" é só texto).
- INSS com tabela 2025 (2026: 7,5% até 1.621,00 · 9% até 2.902,84 · 12% até 4.354,27 · 14% até 8.475,55 — conferir no DOU).
- Cadastro sem CPF, PIS, endereço, banco.
- **"Verba por fora"** modelada como recurso do sistema e exibida no holerite → passivo trabalhista/previdenciário. **Decisão jurídica antes de evoluir.**

**Mercado:** Senior/TOTVS/Domínio (folha completa + eSocial), Sólides/SOC (saúde ocupacional, S-2220/S-2240).

**Recomendações**
- ALTA: definir escopo — o app **não deve competir com o sistema de folha**; o ideal é gerar as **variáveis de folha** (HE, noturno, faltas, diárias) a partir do apontamento e exportar para o sistema/contador. 13º pode ficar como simulador.
- ALTA: tabelas parametrizadas por vigência (INSS 2026, IRRF com redutor da Lei 15.270/2025) se o cálculo for mantido.

## 15. Obras / Pessoal de campo
**O que funciona:** NRs estruturadas com vencimento e alertas, painel de conformidade, turnos e regras de HE, apontamento diário (HE 50/100, viagem, noturno, alojamento), RDO.

**Problemas**
- Custo diário ignora DSR e encargos configurados, apesar do rótulo "com encargos".
- **NRs fabricadas:** sincronização grava NR-06 e NR-35 como padrão sem evidência (`rhPayrollService.ts:743`) — risco de segurança e jurídico.
- ASO é tratado como "mais uma NR" (sem tipos admissional/periódico/demissional, PCMSO).
- Sem registro de **integração de segurança por planta do cliente**.
- Anexos em base64 dentro do documento (estoura 1 MB).
- Ponto digitado pelo encarregado (sem marcação pelo trabalhador, geolocalização, facial, Portaria 671).

**Recomendações**
- ALTA: remover NRs padrão; **bloquear alocação** (OS, equipe, viagem) se ASO / NR exigida pelo cargo / integração do cliente estiver vencida.
- MÉDIA: DSR, encargos, hora noturna reduzida, periculosidade/insalubridade por cargo/obra; controle de ASO por tipo; integração por planta com validade.
- MÉDIA: ponto pelo próprio trabalhador com GPS/foto e **offline** (alojamento/planta) — ref. Pontotel, Tangerino, Sólides Ponto.

## 16. Cadastro do funcionário por link — diagnóstico

**Como funciona hoje:** RH gera link (token forte) → envia por WhatsApp (`wa.me`) → candidato preenche 6 etapas (com ViaCEP e upload) → RH lista e aprova → vira funcionário.

**Por que está incompleto/quebrado**
1. **Dados se perdem:** admissões ficam em `data_hr_onboardings.json` no disco do servidor (some a cada deploy/restart no Cloud Run). A cópia para o Firestore roda só no navegador do RH, engole erros e falha com anexos (> 1 MB).
2. **Vazamento LGPD:** `GET /api/hr/onboarding/list` sem login devolve CPF, RG, PIS, endereço, banco e documentos de qualquer empresa.
3. **Upload quebra:** tela aceita 8 × 15 MB em base64 contra limite de 50 MB do servidor → fotos de celular dão erro. Sem compressão nem Storage.
4. **Aprovação descarta quase tudo:** o funcionário criado não recebe CPF, PIS, RG, endereço, banco, contato de emergência nem documentos (CPF vira texto em "observações"); matrícula aleatória vira "Obra REG-xxx" fantasma; salário padrão R$ 4.070; sem unidade/contrato.
5. **Validação fraca:** sem dígito verificador de CPF/PIS, documentos não obrigatórios; faltam campos do eSocial S-2200 (raça/cor, escolaridade, dependentes com CPF), tamanho de EPI/uniforme, CNH, NRs prévias.
6. **Falta a jornada:** devolver com pendência, agendar ASO admissional, contrato com assinatura eletrônica, checklist de documentos por cargo, aviso ao RH quando o candidato envia.

**Mercado:** Senior, TOTVS e Gupy Admissão — link por WhatsApp/SMS, fotos dos documentos no celular, checklist por cargo, assinatura eletrônica, envio ao eSocial.

**Recomendação (ALTA):** gravar pelo servidor no Firestore + documentos no Cloud Storage; comprimir imagens no celular; proteger rotas do RH; aprovação cria **um cadastro único de pessoa** com todos os dados; fluxo de pendência/devolução; depois, ASO e assinatura.

## 17. Estrutura (organização)
- Abas de organização, unidades, contratos, ativos, usuários, auditoria.
- Sem cargos (CBO, NRs exigidas, faixa salarial) e departamentos como cadastro; senha em texto puro; checagem de e-mail lê usuários de todas as empresas.
- ALTA (segurança, ver 0.1). BAIXA: cadastro de cargos — base para "NRs exigidas por cargo".

---

## 18. Viagens
- **Preços inventados no código** (tarifas por corredor, voos de template) exibidos como `confirmado_fonte` — 23 ocorrências. A rota de busca do servidor não consulta nada.
- Dossiê NR/ASO do técnico é fixo ("Carlos Eduardo Silva").
- Selects de obra/centro de custo vazios (props não passadas). Limite de orçamento derivado da própria oferta.
- Reembolsos em arquivo JSON, sem login, com padrões fixos (OS-2025-042).
- Bom: solicitação/aprovação, break-even van × ônibus, OCR de cupom.

**Mercado:** Onfly (limite por centro de custo/projeto), Paytrack/VOLL (política por cargo, adiantamento/cartão).

**Recomendações**
- ALTA: tirar a busca de preços falsa (manter links diretos) ou rotular "estimativa"; ligar a obra/centro de custo/pessoa reais; dossiê vindo do cadastro de NR.
- MÉDIA: **"Despesas de Campo" único** (hoje 3 caminhos: reembolsos, OCR WhatsApp, NDs) lançando custo na obra; controle de alojamento por obra; política por cargo.
- BAIXA: integrar com uma agência (TMC) em vez de conectores próprios.

## 19. Marketing
- Campanhas/eventos só no navegador; métricas de performance fixas; conteúdo é endomarketing (SIPAT, Setembro Amarelo).
- Para uma montadora B2B o que vale é: **portfólio de obras** gerado das obras concluídas, **acervo de atestados de capacidade técnica / CAT / CAO** (Res. Confea 1.137/2023) por serviço, book técnico e cadastro de fornecedor (certidões, ISO, NRs da equipe).
- ALTA: criar "Acervo Técnico e Portfólio" (dentro do Comercial). BAIXA: mover SIPAT/DDS para SST ou cortar o restante.

## 20. Relatórios
- Lê dados reais, exporta CSV/PDF/XLSX (funciona).
- "Análise preditiva" é heurística e **mistura 6 ativos fictícios** com os reais.
- Não usa HH, obras, contratos, compras, composição de custos, viagens.
- ALTA: **"Resultado por Obra"** — receita/medição × custo de MO (HH × taxa) + materiais + viagens/despesas → margem real × orçada (ref. Procore "Planned vs Actual", Sienge). Remover ativos fictícios.
- MÉDIA: curva S, HH por disciplina.

## 21. Suporte e Configurações
- Suporte: chamados gravados, mas ninguém do outro lado responde. Cortar ou trocar por link de WhatsApp/e-mail.
- Configurações: "Parâmetros da operação" (SLA, limite LPU, alerta de estoque) **não são salvos** — só mostram sucesso. ~400 linhas duplicam a config de WhatsApp.

## 22. Agente de WhatsApp e IA

**Hoje:** um único WhatsApp (Baileys, não oficial) para o servidor inteiro; o agente classifica intenção e faz `if/else`; só enxerga NDs, OCR e mensagens locais; rotinas agendadas de 3 tipos fixos rodando em memória; rascunho de regra global (dois usuários se atropelam). Na prática: bot de reembolso/ND de um único dono.

**Distância para a visão (cada usuário conecta seu WhatsApp e tem um agente):**
| Requisito | Hoje | Falta |
|---|---|---|
| Cada usuário conecta o seu | 1 sessão global | sessão por empresa/usuário |
| Perguntar sobre dados | só NDs/OCR | ferramentas no servidor com acesso ao Firestore, por empresa |
| Executar ações | não existe | function calling + confirmação ("responda SIM") + auditoria |
| Rotinas programadas | 3 tipos fixos | rotina = prompt + ferramentas + horário + destino |
| Identidade | lista de telefones | telefone vinculado ao usuário, com permissões por papel |

**Riscos:** Baileys viola os termos do WhatsApp (risco de banimento do número); desde 15/01/2026 a API oficial proíbe assistentes "de uso geral" — o agente precisa ser focado na operação da empresa (permitido).

**Recomendações**
- P0: segurança (seção 0.1).
- P1: WhatsApp Cloud API oficial com cadastro embutido (cada empresa/usuário conecta o número) — ou via BSP/Composio, que já é usado; dados em Firestore; agendador durável (Cloud Scheduler/Tasks).
- P2: agente com **ferramentas** (`listar_os`, `saldo_estoque`, `status_proposta`, `nds_periodo`, `criar_os`, `agendar_rotina`…) respeitando papel do usuário; rotinas como "todo dia 7h me mande OS atrasadas e estoque crítico". Custo de referência no Brasil: ~R$ 0,04–0,05 por mensagem utility (conferir tabela Meta).

---

## 23. O que cortar ou juntar (opinião)
1. **Busca de passagens multi-fonte** (~3.500 linhas gerando preço falso): cortar. Manter solicitação/missão ligada à obra, links diretos, break-even, alojamento.
2. **Reembolsos + OCR WhatsApp + ND**: juntar em "Despesas de Campo".
3. **Marketing**: trocar por "Acervo Técnico e Portfólio".
4. **Folha**: não reinventar folha; gerar variáveis para o sistema do contador.
5. **Suporte**: cortar até haver atendimento.
6. **Três cadastros de pessoa → um**; **dois catálogos → um**.

## 24. Sequência sugerida
1. **Fundação de segurança** — Firebase Auth real, regras por empresa, rotas autenticadas, limpar git/segredos, remover dados fictícios.
2. **Fundação de dados** — cadastro único de pessoa, `orgId` padronizado, servidor com acesso ao Firestore, arquivos → Firestore/Storage.
3. **Admissão por link** completa (usa 1 e 2).
4. **Espinha operacional** — Proposta ganha → Obra → OS (com APR/PT, NR válida, fotos reais, HH) → estoque/compras.
5. **Resultado por Obra** (orçado × realizado).
6. **Agente WhatsApp** com ferramentas sobre os dados já integrados.

*Não verificado:* o app não foi executado; números legais de 2026 vêm de fontes secundárias (conferir DOU); referências de mercado são majoritariamente material dos próprios fornecedores.
