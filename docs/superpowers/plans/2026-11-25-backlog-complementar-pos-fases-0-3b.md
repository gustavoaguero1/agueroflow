# AgueroFlow — backlog complementar de evolução pós-fases 0–3B

**Base:** main após a incorporação da cadeia de implementação consolidada pela PR #57.  
**Referências anteriores:** PR #45 (plano diretor), PR #46 (plano diretor v2) e PRs de implementação #47–#56.  
**Natureza:** sugestões e priorização de evoluções futuras. Este documento não implementa funcionalidades e não substitui os planos anteriores.

---

## 1. Objetivo e escopo

Este documento registra o que ainda vale evoluir no AgueroFlow depois de uma sequência relevante de implementações. Ele é um **backlog complementar**, não uma nova versão do plano diretor original.

A PR #45 estabeleceu a direção de integração industrial. A PR #46 complementou essa visão. Em seguida, várias recomendações viraram implementações em PRs específicas, e a cadeia foi incorporada à main pela PR #57. Portanto, este documento:

- reconhece as funcionalidades já entregues;
- não as apresenta como pendências;
- não recomenda recriar módulos, cadastros ou fluxos já existentes;
- concentra-se em aprofundamentos, lacunas residuais e capacidades realmente novas;
- propõe prioridades e critérios de aceite para futuras PRs de código.

**Regra de execução:** antes de implementar qualquer item, revisar a main novamente, verificar se outra PR já o entregou e trabalhar sobre o domínio existente. Uma sugestão deste documento não é prova de ausência no código.

## 2. Base implementada que não deve ser duplicada

As seguintes entregas estão documentadas nas PRs já incorporadas pela cadeia #47–#57. O trabalho futuro deve estendê-las, não recomeçá-las.

| Capacidade já entregue | PRs de referência | Diretriz |
|---|---:|---|
| Integridade de OS, criação/transição no servidor, idempotência, eventos, checklist e Storage | #47 e #49 | Não voltar a alterar status diretamente no cliente nem recriar outro fluxo de OS |
| Saneamento de dados legados de RH e relatório de pendências | #48 | Resolver pendências por revisão humana, sem completar campos com valores presumidos |
| Projeto/Obra mestre e vínculos opcionais por projectId | #50 | Usar a entidade projects existente |
| Identidades mestres de pessoa e material, com revisão humana | #51 | Reutilizar IDs estáveis de RH e catálogo items |
| Isolamento multiempresa do WhatsApp, admissão persistida em Firestore/Storage e remoção de PDFs versionados | #52 | Não reabrir como pendência a separação multiempresa já entregue |
| Proposta ganha gerando Contrato, Projeto/Obra, baseline congelado e OS inicial | #53 | Evoluir o processo derivado, sem criar conversão paralela |
| Gate de OS de risco com PT aprovada e NR/EPI vigentes | #54 | Complementar requisitos por planta/cliente; não criar outro gate SMS |
| Livro de custos realizados e relatório Resultado por Obra | #55 | Aumentar cobertura dos fatos no ledger existente |
| Medições e Boletim de Medição ligados a LPU e Contas a Receber | #56 | Evoluir revisão, evidências e ciclo de receita já criado |
| Planejamento inicial por marcos e avanço ponderado | #39 | Aprofundar cronograma e recursos no módulo de Obras existente |
| RDO estruturado e confirmação autenticada | #40 | Integrar dados reais de campo, sem presumir equipe ou horas |
| Gestão de documentos de Engenharia com revisão, histórico e Storage privado | #41 | Estender o acervo existente e não criar outro repositório |
| Qualidade, ensaios, não conformidades, punch list e comissionamento | #42 | Aumentar rastreabilidade técnica e dossiê de entrega |
| APR/PT, EPI, treinamentos e controles de SMS | #43 | Complementar regras por cliente/planta |
| Incorporação da cadeia de fases à main | #57 | Usar a main atual como fonte de verdade |

As PRs #45 e #46 continuam como referências estratégicas. O presente documento não tenta substituir a especificação delas; registra somente o backlog complementar após as implementações.

## 3. Princípios de arquitetura e gestão

1. **Projeto/Obra é o eixo do resultado.** Contrato representa o compromisso comercial/jurídico; Projeto/Obra representa a execução e seu resultado; OS representa uma unidade de execução.
2. **Uma única identidade por entidade.** Pessoa deve referenciar o ID mestre de RH; material deve referenciar o catálogo mestre; projeções operacionais não devem criar entidades independentes.
3. **Fonte de verdade explícita.** Cada registro deve ter origem, empresa, autor, horário, estado e vínculos. Não completar dados ausentes com exemplos ou defaults silenciosos.
4. **Previsto, comprometido, realizado, medido, faturado e recebido são conceitos distintos.** Não misturar valores nem contabilizar a mesma origem duas vezes.
5. **Transações e idempotência em operações críticas.** Saldo, evento, status, aprovação e documento derivado precisam permanecer consistentes em falhas e concorrência.
6. **Autorização em todas as camadas.** Interface, API, Firestore e Storage devem aplicar empresa, área, papel e escopo do registro.
7. **A IA auxilia, mas não substitui controles.** Toda consulta deve respeitar acesso; toda ação de escrita exige autorização, confirmação e auditoria.
8. **Modernização incremental.** Preservar as rotinas do legado Operações enquanto as responsabilidades migram para serviços e módulos próprios.
9. **Protheus continua como referência fiscal/contábil.** AgueroFlow organiza a execução, rastreabilidade e custos gerenciais; integrações devem evitar duplicação de obrigações fiscais.

## 4. Recomendações por módulo existente

### 4.1 Painel / Dashboard

**Evoluções sugeridas**
- Centralizar pendências acionáveis de OS, Compras, Estoque, SMS, Qualidade, Medições e Financeiro.
- Padronizar filtros por Projeto/Obra, contrato, unidade/planta, centro de custo e período.
- Mostrar separadamente previsto, comprometido, realizado, medido, faturado e recebido.
- Informar origem, data de atualização e cobertura dos dados de cada KPI.
- Criar visões adequadas a diretoria, gestão, supervisão e campo.
- Fazer cada alerta abrir o registro de origem e a ação necessária.

**Aceite:** nenhum KPI mistura dados demonstrativos ou estimativas com valores realizados; cobertura insuficiente aparece explicitamente.

### 4.2 Ordens de Serviço e Execução

**Já entregue:** criação e transição no servidor, eventos, idempotência, evidências privadas e gate SMS para OS de risco.

**Evoluções sugeridas**
- Dividir a OS em atividades/operações menores, com responsável, duração, precedência e apontamento.
- Apontar horas por pessoa e atividade, separando produção, espera, deslocamento e improdutividade, sempre com origem e justificativa.
- Integrar reserva, retirada, consumo, devolução, perda e sucata de materiais com movimentos reais do Estoque.
- Reservar ferramentas/equipamentos e impedir uso quando indisponíveis por manutenção ou calibração.
- Melhorar o aceite do cliente com evidência, autor, horário, versão e referência verificável; diferenciar ciência interna de assinatura eletrônica certificada.
- Evoluir a experiência de campo para operação offline e sincronização com resolução explícita de conflitos.
- Medir tempo de ciclo, retrabalho, impedimentos e aprovação na primeira inspeção.

**Aceite:** a conclusão da OS valida no servidor todos os requisitos configurados e registra a transição junto dos eventos e efeitos associados, sem depender da interface.

### 4.3 Aprovações LPU e Medições

**Já entregue:** Boletim de Medição com fluxo de estado, eventos, glosa justificada e geração de título em Contas a Receber após aprovação.

**Evoluções sugeridas**
- Versionar tabelas LPU por cliente/contrato, com vigência, reajustes e alçadas.
- Congelar no boletim a versão, os preços e as regras aplicáveis à data da medição.
- Comparar quantidades contratadas, executadas, medidas, aprovadas, glosadas e saldo.
- Registrar evidências por linha: OS, etapa, quantidade, unidade, período e documento comprobatório.
- Criar ciclos de revisão e devolução ao responsável, preservando versões anteriores.
- Preparar exportação/conferência com layouts usados pelo cliente, sem simular envio ou aprovação externa.

**Aceite:** alterar a LPU não modifica boletins antigos; cada glosa exige justificativa e cada total pode ser reconstruído a partir das linhas e eventos.

### 4.4 OS Recorrentes

**Evoluções sugeridas**
- Criar agendamento durável no servidor, com calendário de exceções e feriados configuráveis.
- Avançar automaticamente a próxima ocorrência depois de uma geração válida.
- Permitir pausa, retomada, cancelamento e encerramento.
- Criar OS com atividades, checklists, equipe e materiais previstos a partir de modelos versionados.
- Usar uma chave idempotente por plano e período para impedir duplicidade em reinícios ou instâncias concorrentes.
- Exibir falhas de geração como pendências tratáveis.

**Aceite:** cada ocorrência gera no máximo uma OS, mesmo com reexecução, concorrência ou reinício do serviço.

### 4.5 Checklists

**Já entregue:** versionamento de modelos e validação de finalização no servidor.

**Evoluções sugeridas**
- Regras condicionais entre perguntas e blocos.
- Evidência por item: foto, documento, medição, comentário e ciência/assinatura quando aplicável.
- Faixas de aceitação e criticidade configuráveis por modelo.
- Conversão de resposta crítica em ocorrência ou não conformidade vinculada à execução original.
- Modelos por disciplina, cliente/planta e etapa de fabricação/montagem.
- Operação offline com prevenção de duplicidade na sincronização.

**Aceite:** cada execução guarda snapshot da versão; campos obrigatórios e evidências exigidas são validados no servidor.

### 4.6 Inspeções, Qualidade e Comissionamento

**Já entregue:** fluxo de inspeção/revisão, ensaios, não conformidades, punch list e comissionamento com histórico.

**Evoluções industriais sugeridas**
- Criar passaporte de juntas soldadas por Projeto/Obra, linha/spool e documento técnico.
- Registrar junta, material, corrida, soldador/sinete, procedimento EPS/WPS, data, inspeção e resultado.
- Relacionar laudos LP/PT, PM/MT, US/UT e RX/RT à junta ou componente correspondente.
- Controlar testes hidrostáticos/pneumáticos por circuito ou trecho, com pressão, fluido, duração, instrumento e critério de aceitação.
- Associar instrumentos e certificados de calibração vigentes às inspeções.
- Permitir matriz de inspeção e testes (ITP/PIT) por contrato/projeto, com pontos de espera, testemunho e revisão.
- Montar dossiê/data book final a partir de documentos, inspeções, certificados, ensaios, não conformidades e As Built já existentes.
- Exibir completude e pendências do dossiê por disciplina, linha ou sistema.

**Aceite:** nenhuma junta, corrida, qualificação, evidência ou resultado pode ser presumido; cada evidência referencia um registro/documento válido e mantém seu histórico.

### 4.7 Peças, Serviços e Catálogo Mestre

**Já entregue:** catálogo operacional de materiais e vínculo de identidade mestre com revisão humana.

**Evoluções sugeridas**
- Completar atributos técnicos estruturados por família: material, norma, classe, diâmetro, espessura, schedule, acabamento, conexão e unidade.
- Manter equivalências/substituições técnicas aprovadas, com autor, justificativa, validade e restrições.
- Mapear gradualmente materiais comerciais para items sem casamento automático por descrição aproximada.
- Guardar histórico de preços por fornecedor, NF/cotação, data, quantidade e condição comercial.
- Diferenciar preço confirmado, último preço histórico, preço médio e estimativa.
- Controlar unidade de compra, unidade de estoque e conversões aprovadas, com fator e trilha de alteração.

**Aceite:** equivalência técnica e conversão de unidade nunca são inferidas silenciosamente por IA, descrição parecida ou conveniência de tela.

### 4.8 Estoque

**Já entregue:** movimentações transacionais, custo médio, proteção de saldo e integração de recebimento com origem de compra.

**Evoluções sugeridas**
- Rastrear lote, corrida metalúrgica, fabricante, certificado, série e validade por item/recebimento.
- Gerenciar saldos por almoxarifado e obra, com transferência em trânsito e confirmação no destino.
- Separar saldo físico, reservado, disponível e comprometido por projeto/OS.
- Registrar devolução de sobra, sucata, perda e material não conforme sem apagar movimentos anteriores.
- Inventário rotativo com contagem, divergência, aprovação e ajuste auditável.
- Associar certificados de matéria-prima ao lote e permitir localizar onde o material foi aplicado.
- Sugerir reposição/RC a partir de estoque mínimo, demanda planejada e compras já abertas.
- Rastrear consumo por OS e etapa de fabricação/montagem.

**Aceite:** toda alteração de saldo atualiza atomicamente saldo, movimento, custo e vínculo de origem; transferência não pode perder material no percurso.

### 4.9 Ocorrências

**Evoluções sugeridas**
- Unificar a taxonomia de qualidade, SMS, operação e manutenção sem apagar a categoria de origem.
- Relacionar ocorrência a Projeto/Obra, OS, pessoa, equipamento, linha/sistema e documento técnico.
- Registrar causa raiz, plano 5W2H, responsável, prazo, evidências e verificação de eficácia.
- Medir reincidência, tempo de resolução e pendências vencidas.
- Gerar OS corretiva ou ação de qualidade mantendo relação bidirecional e sem duplicar a ocorrência.

**Aceite:** ocorrências críticas só encerram com evidência e verificação quando exigidas pela política; histórico anterior permanece imutável.

### 4.10 Relatórios e Resultado por Obra

**Já entregue:** livro de fatos de custos realizados, relatório Resultado por Obra e vínculo de medição aprovada com Contas a Receber.

**Evoluções sugeridas**
- Ampliar a cobertura de mão de obra, materiais, equipamentos, viagens, despesas de campo e terceiros.
- Exibir lacunas: horas sem taxa, consumo sem custo, despesa sem projeto, medição sem aprovação e documentos pendentes.
- Comparar produtividade real por disciplina/atividade com índices previstos no orçamento-base.
- Projetar custo ao término (EAC) e desvio do orçamento, mostrando as premissas utilizadas.
- Adicionar curva S física e financeira com base no baseline e nas medições aprovadas; avanço interno não deve ser confundido com receita aprovada.
- Analisar por contrato, cliente, unidade/planta, OS, disciplina e centro de custo.
- Exportar relatórios com filtros, data de corte, origem e trilha de geração.

**Aceite:** não criar um segundo motor de custos; o relatório consome o ledger e distingue previsto, comprometido, realizado, medido, faturado e recebido.

### 4.11 Suporte

**Evoluções sugeridas**
- Manter chamados se existir equipe responsável pelo atendimento.
- Incluir categoria, prioridade, responsável, prazo/SLA, comentários, anexos e histórico.
- Criar fila, escalonamento e indicadores de resolução.
- Se não houver operação interna de suporte, substituir o módulo por canal de contato claro, sem simular atendimento.

**Aceite:** não apresentar SLA, responsável ou status de atendimento sem processo e equipe reais.

### 4.12 AgueroFlow IA

**Evoluções sugeridas**
- Evoluir o assistente para ferramentas de domínio: consultar OS, estoque, compras, Projeto/Obra, custos, medições, qualidade e pendências.
- Apresentar origem, horário, filtros e cobertura dos dados usados na resposta.
- Aplicar em cada ferramenta as permissões da empresa, área, papel e registro; IA não recebe privilégio adicional.
- Separar consulta, preparação de rascunho e execução de ação.
- Exigir confirmação para escrita, usar idempotência e registrar auditoria.
- Quando o dado estiver ausente, desatualizado ou indisponível, informar isso em vez de completar com suposição.
- Criar avaliações automatizadas de respostas e chamadas de ferramentas com cenários de acesso permitido e negado.

**Aceite:** toda ferramenta revalida autorização no servidor, limita o escopo da operação e registra autor, empresa, ação e resultado.

### 4.13 Estrutura, Contratos e Projetos

**Já entregue:** entidade mestre Projeto/Obra, vínculos projectId e conversão da proposta ganha com baseline.

**Evoluções sugeridas**
- Suportar contratos com vários Projetos/Obras e frentes, preservando a relação jurídica e operacional.
- Cadastrar requisitos por cliente/planta: documentação, segurança, qualidade, integração, acesso e padrões técnicos.
- Consolidar centros de custo, departamentos, disciplinas, cargos e responsáveis.
- Versionar aditivos, escopo, vigência, reajuste, SLA e limites contratuais.
- Exibir completude cadastral e referências inválidas antes de liberar processos dependentes.

**Aceite:** todo vínculo aponta para registro real da mesma empresa; nenhuma nova entidade paralela representa o mesmo contrato ou projeto.

### 4.14 Configurações e Governança

**Evoluções sugeridas**
- Garantir que todo parâmetro visível na interface seja persistido e efetivamente aplicado.
- Versionar parâmetros com vigência, responsável e histórico.
- Configurar alçadas por valor, margem, área e centro de custo.
- Parametrizar regras por contrato/planta para execução, qualidade, SMS e compras.
- Registrar alterações e permitir reversão controlada, quando segura.
- Manter testes de sincronização entre permissões declaradas, API, Firestore e Storage.

**Aceite:** nenhuma configuração deve exibir sucesso sem gravação confirmada; regra crítica deve ser testada no backend/banco.

### 4.15 Obras, Planejamento e RDO

**Já entregue:** planejamento inicial por marcos, datas e avanço ponderado, RDO estruturado e confirmação autenticada.

**Evoluções sugeridas**
- Cronograma com dependências, caminho crítico, calendários e baseline versionado.
- Planejamento semanal de mão de obra, equipamentos, materiais e frentes.
- Comparar produção planejada e realizada por atividade/quantidade física.
- Registrar paralisações, impedimentos, produtividade e justificativas.
- Apropriar horas aprovadas ao Projeto/Obra e à OS sem duplicar lançamentos.
- Evoluir curva S e previsão de conclusão usando dados efetivos, com premissas visíveis.
- Adicionar operação offline segura para apontamentos de campo.

**Aceite:** avanço físico deve ter unidade, origem e regra de ponderação; RDO e medição de cliente permanecem conceitos separados.

### 4.16 Bens Coletivos / Patrimônio

**Já existe:** cadastro de ativos/bens, movimentações, retiradas/devoluções e manutenção/calibração.

**Evoluções sugeridas**
- Evoluir o domínio existente para Gestão de Ativos/CMMS, sem criar cadastro paralelo.
- Plano de manutenção preventiva por horímetro, uso, calendário ou criticidade.
- Ordem de manutenção corretiva com diagnóstico, peças, mão de obra e histórico.
- Aplicar bloqueio de uso no backend quando manutenção ou calibração impedir utilização.
- QR Code, localização, responsável, disponibilidade e custo por período.
- Integrar ferramentas/equipamentos reservados à OS e ao custo do Projeto/Obra.

**Aceite:** equipamento bloqueado por manutenção/calibração não pode ser reservado ou retirado por chamada direta à API/banco.

### 4.17 RH / Pessoas

**Já entregue:** identidade mestre de pessoa, projeções operacionais vinculadas e saneamento de defaults legados.

**Evoluções sugeridas**
- Matriz de competências por função, disciplina e atividade.
- Disponibilidade por escala, férias, afastamentos e alocação em Projeto/Obra.
- Histórico de cargos, qualificações, treinamentos e vencimentos.
- Exportação de variáveis de folha (horas, adicionais, faltas e diárias) para o sistema/contador.
- Indicadores de custo e produtividade por equipe, preservando acesso restrito a dados salariais.
- Fluxo de revisão para documentos e qualificações, com status pendente quando faltar evidência.

**Limite:** não transformar o AgueroFlow em folha completa nem presumir aptidão, treinamento ou dado salarial.

**Aceite:** alocação depende de identidade estável e evidências válidas; dado ausente é pendência explícita, não valor padrão.

### 4.18 Comercial / OrçaÁgil

**Já entregue:** funil com transições no backend, composição sem fallback silencioso, conversão de proposta ganha e baseline congelado.

**Evoluções sugeridas**
- Biblioteca de coeficientes de produtividade por disciplina e unidade (HH/kg, HH/m, HH/junta, HH/diâmetro-polegada), identificando fonte e revisão.
- Composição detalhada de mão de obra por função, jornada, adicionais, mobilização e benefícios com tabela de parâmetros validada.
- Modelos reutilizáveis de orçamento sem dados fixos de clientes tratados como padrão universal.
- Revisões de proposta com comparação linha a linha e histórico de margem.
- Histórico de cotação real de fornecedor, data, validade, condição e documento de origem.
- Aprovação de margem/desconto por alçada.
- Portfólio técnico ligado a obras concluídas e documentos autorizados.

**Aceite:** preço confirmado, histórico, coeficiente de produtividade e estimativa de IA são exibidos como categorias distintas, com fonte e data; o baseline aprovado não é recalculado silenciosamente.

### 4.19 Compras

**Já entregue:** vínculo de OS nas requisições/pedidos, recebimento integrado ao Estoque e conciliação com NF-e/Financeiro nas etapas recentes.

**Evoluções sugeridas**
- Alçadas configuráveis por valor, categoria, contrato e centro de custo.
- Avaliar fornecedores por prazo, qualidade, conformidade documental, preço e atendimento.
- Registrar entrega programada, parcial, atraso e divergência por item.
- Histórico de preço comparável por unidade, especificação e condição de compra.
- Exigir certificado/lote/qualificação para famílias de materiais configuradas.
- Acompanhar prazo prometido versus recebido e compras emergenciais fora do planejamento.
- Derivar demanda da BOM/OS e mostrar saldo, reserva e pedidos em aberto para evitar compra duplicada.

**Aceite:** aprovação e recebimento obedecem às alçadas e não podem ser simulados por estado de interface; comparação usa propostas/documentos reais.

### 4.20 Financeiro

**Já entregue:** NF-e, Contas a Pagar, Contas a Receber, liquidações, conciliação e integração de medição aprovada com título a receber.

**Evoluções sugeridas**
- Projeção de caixa por vencimento, aprovação e probabilidade claramente identificada.
- Conciliação entre OC, recebimento, NF-e, título e pagamento, com divergências explicadas.
- Apropriação por Projeto/Obra, contrato e centro de custo sem duplicar fatos do ledger.
- Fluxo de adiantamentos, despesas de campo e prestação de contas com origem e comprovantes.
- Indicadores de comprometido, vencido, pago, recebido e saldo a receber.
- Integração gradual com Protheus para exportação/importação controlada e reconciliação de IDs/status.

**Limite:** Protheus continua responsável pela escrituração/fiscal quando aplicável; AgueroFlow não deve emitir ou contabilizar em duplicidade.

**Aceite:** todo título tem origem rastreável; sincronização repetida com Protheus é idempotente e divergências ficam pendentes, não são corrigidas silenciosamente.

### 4.21 Viagens e Despesas de Campo

**Evoluções sugeridas**
- Consolidar solicitação, aprovação, passagem, hospedagem, transporte, adiantamento e prestação de contas.
- Vincular obrigatoriamente Projeto/Obra, pessoa e centro de custo quando a despesa for operacional.
- Aplicar política por cargo, contrato, destino e limite, com alçada.
- Manter busca de ofertas somente quando a fonte for efetivamente consultada; preço de modelo ou simulador é estimativa claramente identificada.
- Unificar despesas de campo e reembolsos sem duplicar OCR/ND ou comprovantes.
- Apropriar despesas ao ledger por origem e impedir dupla contabilização.

**Aceite:** nenhum preço ou reserva é chamado de confirmado sem consulta/fonte; despesas têm comprovante, autor e vínculo ou ficam em pendência.

### 4.22 Marketing / Portfólio Técnico

**Oportunidades**
- Priorizar um portfólio B2B de obras, equipamentos, fabricação, tubulações e serviços concluídos.
- Reunir fotos autorizadas, descrições, escopo, cliente (quando permitido), indicadores e documentos de capacidade técnica.
- Organizar atestados, CAT/CAO e certificações, com validade e acesso privado quando necessário.
- Criar fluxo de aprovação de conteúdo e biblioteca reutilizável.
- Tornar campanhas, eventos e assets compartilhados entre usuários, com persistência no backend; evitar depender exclusivamente de localStorage para dados corporativos.
- Medir desempenho somente quando vier de fonte real e identificada.

**Aceite:** conteúdo sensível ou de cliente exige autorização de publicação; métricas sem integração não são apresentadas como resultados reais.

### 4.23 WhatsApp e Automações

**Já entregue:** sessões e dados segregados por empresa, com controles de acesso e persistência das informações indicadas na PR #52.

**Evoluções sugeridas**
- Alertas operacionais de OS, compras, recebimento, medição e documentos vencendo.
- Rotinas agendadas duráveis, configuráveis e monitoradas, sem depender de timers em memória.
- Ferramentas de consulta autorizadas para dados da empresa.
- Ações de escrita com confirmação explícita e registro de autoria.
- Fila de envio, retentativa controlada, deduplicação e painel de falhas.
- Políticas por empresa, usuário, canal e tipo de mensagem.

**Aceite:** falha de envio é visível; reprocessamento não duplica ações nem mensagens; a autorização é revalidada em cada execução.

### 4.24 Operações legado

**Diretriz:** manter a compatibilidade com o módulo legado e modernizar gradualmente.

**Evoluções sugeridas**
- Inventariar cada tela/fluxo ainda hospedado no iframe e seu consumo de dados.
- Migrar uma capacidade por vez para serviços e componentes React, mantendo contratos de dados e testes de regressão.
- Reutilizar cadastros mestres de RH, Projeto/Obra, Estoque e Financeiro.
- Conectar diário, horas, viagem, reembolso, gases e tarefas aos registros transacionais existentes.
- Reduzir leituras completas repetidas e melhorar consultas incrementais.

**Aceite:** nenhuma migração remove fluxo usado em campo sem substituição funcional, teste e plano de compatibilidade.

## 5. Novas capacidades que podem justificar módulos/áreas próprios

Não criar todas imediatamente. Reaproveitar módulos existentes sempre que o domínio couber neles.

### 5.1 Produção e Fabricação

**Prioridade:** alta quando o controle da fabricação em oficina for parte relevante da operação.

Escopo sugerido:
- Ordens de fabricação vinculadas ao Projeto/Obra, BOM e desenho/revisão liberados.
- Roteiro por operação: corte, preparação, conformação, montagem, solda, acabamento, inspeção e expedição.
- Apontamento de quantidade boa, perda, retrabalho e horas por operação.
- Reserva/baixa de matéria-prima com lote/corrida e rastreabilidade.
- Identificação de peças, subconjuntos, spools e volumes para embalagem/expedição.
- Inspeções e pontos de parada integrados à Qualidade.
- Programação de capacidade de máquinas, equipes e terceiros.

**Aceite:** produção consome BOM/revisão liberada, referencia materiais e gera fatos de custo sem duplicar o Estoque ou o ledger.

### 5.2 Portal do Cliente

**Prioridade:** futura, após estabilizar processos internos.

Escopo sugerido:
- Acesso externo segregado por cliente e contrato.
- Acompanhamento de avanço, OS liberadas para visualização e cronograma.
- Consulta a documentos aprovados e dossiês autorizados.
- Revisão de medições, registro de comentários e aceite conforme fluxo contratual.
- Notificações e histórico de interações.

**Aceite:** identidade externa, autorização, Storage e consultas são isolados do modelo de acesso interno; o cliente nunca recebe acesso direto genérico ao workspace da empresa.

### 5.3 CMMS como evolução de Patrimônio/Bens Coletivos

**Prioridade:** média.

Não criar um segundo cadastro de ativos. Evoluir o módulo existente com:
- árvore de ativos/equipamentos por cliente, planta e sistema;
- planos preventivos por calendário, horímetro ou ciclos;
- OS de manutenção corretiva/preventiva;
- histórico de falhas, peças, mão de obra e indisponibilidade;
- indicadores MTBF/MTTR somente com dados suficientes;
- integração com Estoque e custos por Projeto/Obra.

**Aceite:** plano preventivo gera ordens de forma idempotente; indisponibilidade e bloqueios são aplicados no servidor.

## 6. Backlog priorizado

### P0 — Confiabilidade operacional e governança

1. Revisar e fechar lacunas de autorização por recurso entre API, Firestore e Storage.
2. Tornar agendamentos de OS recorrentes e automações duráveis, idempotentes e observáveis.
3. Completar a rastreabilidade de execução: atividades, horas, materiais e equipamentos associados à OS.
4. Garantir persistência multiusuário para dados corporativos ainda mantidos apenas no navegador, começando pelo Marketing.
5. Eliminar dados demonstrativos residuais dos caminhos de produção e rotular explicitamente qualquer simulação/estimativa.
6. Criar indicadores de cobertura e qualidade dos dados para Painel e Resultado por Obra.

### P1 — Profundidade industrial e gestão econômica

1. Passaporte de soldas, ITP/PIT e dossiê técnico consolidado.
2. Lote/corrida/certificado e rastreabilidade de aplicação no Estoque e na OS.
3. Versionamento LPU e evidências detalhadas de medição.
4. Produtividade de montagem e composição de custos com fonte e revisão.
5. Planejamento integrado de capacidade, equipe, equipamento e materiais.
6. Avaliação de fornecedores e alçadas completas de Compras.
7. Projeção de custo ao término, curva S e produtividade baseada em dados reais.

### P2 — Expansão de produto

1. Produção e Fabricação.
2. CMMS integrado ao módulo de ativos existente.
3. Portal do Cliente com identidade e segregação próprias.
4. IA operacional com ferramentas, confirmação e auditoria.
5. Operação offline de campo com sincronização e resolução de conflitos.
6. Integração gradual e reconciliável com Protheus.

## 7. Dependências recomendadas

- Passaporte de soldas depende de Projeto/Obra, documentos de Engenharia, catálogo de materiais, identificação de pessoas e Qualidade existentes.
- Rastreabilidade de materiais depende de lote/corrida/certificado no recebimento e de consumo vinculado à OS.
- Resultado por Obra depende da cobertura de horas, estoque, compras, despesas e medições no ledger existente.
- Curva S depende de baseline, cronograma com datas/pesos e avanço físico confiável; não deve ser derivada de status genérico.
- Produção/Fabricação depende de BOM aprovada, documentos liberados, catálogo técnico, Estoque e inspeções.
- CMMS depende do cadastro atual de ativos, manutenção/calibração, Estoque e OS.
- Portal do Cliente depende de documentos aprovados, medições, regras de visibilidade e identidade externa segregada.
- IA/WhatsApp dependem de APIs autorizadas, tarefas duráveis, logs e controles por empresa.

## 8. Critérios obrigatórios para futuras PRs

Toda PR derivada deste backlog deve:

- entregar comportamento funcional em código; PR exclusivamente documental deve ser explicitamente identificada como tal;
- apontar a tela, serviço, rota, coleção e regras alteradas;
- preservar autenticação, multiempresa, permissões, navegação e identidade visual existentes;
- manter compatibilidade com registros legados, com migração explícita quando necessária;
- validar autorização no servidor e nas regras do banco/Storage;
- usar transações e idempotência em operações críticas;
- adicionar testes unitários, de rota e de emulador conforme o domínio;
- executar lint, testes, build e emuladores quando aplicável;
- documentar limitações e cenários ainda não cobertos;
- não fazer merge nem deploy sem revisão e autorização;
- conferir novamente a main e PRs recentes antes de iniciar, evitando duplicidade de escopo.

## 9. Jornada ponta a ponta para validação da plataforma

A evolução deve ser validada por cenários integrados, não apenas por testes isolados:

1. Uma proposta é aprovada e gera o contrato, Projeto/Obra, baseline e OS inicial.
2. O planejamento cria marcos e atividades com responsáveis e datas.
3. A equipe é alocada usando pessoas e qualificações reais; OS de risco valida PT/NR/EPI.
4. A execução registra horas, RDO, materiais, equipamentos, inspeções e evidências.
5. A falta de material gera requisição, cotação, pedido e recebimento; o material recebido mantém lote/corrida/certificado.
6. Consumo, horas e despesas geram fatos de custo com origem e sem duplicidade.
7. Qualidade reúne inspeções, ensaios, não conformidades e documentos do dossiê.
8. Quantidades executadas geram medição; aprovação gera título a receber de modo idempotente.
9. Financeiro concilia compromissos, NF-e, pagamentos e recebimentos, mantendo o Protheus como referência fiscal/contábil.
10. O Resultado por Obra apresenta previsto, comprometido, realizado, medido, faturado e recebido, incluindo alertas de cobertura.

## 10. Encerramento

O AgueroFlow já possui uma base funcional mais avançada do que aquela observada no início do plano diretor: Projeto/Obra, integração comercial, controles de OS, SMS, custos realizados e Medições foram implementados em PRs próprias e levados à main.

O próximo ciclo deve ser seletivo. Recomenda-se priorizar integridade, durabilidade das automações, rastreabilidade técnica e cobertura dos dados econômicos. Novos módulos só devem nascer quando houver um domínio realmente novo, como Produção/Fabricação ou Portal do Cliente; CMMS deve evoluir Patrimônio/Bens Coletivos.

**Este documento é backlog de sugestões. Cada capacidade só será considerada implementada depois de PR de código, testes e revisão próprios.**
