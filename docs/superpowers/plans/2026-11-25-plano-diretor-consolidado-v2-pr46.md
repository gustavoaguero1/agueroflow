# AgueroFlow — Plano diretor consolidado v2

**Base analisada:** \`main\`, commit \`5e38ac8082d8b82da95a40bd3447a2860509a5b5\`  
**Referência anterior:** PR #45 — plano diretor de integração industrial, já integrado à main  
**Objetivo desta revisão:** consolidar o diagnóstico mais recente, as correções estruturais, a evolução dos 24 módulos e as novas capacidades necessárias para tornar o AgueroFlow uma plataforma integrada de gestão industrial.  
**Natureza desta entrega:** documento de direção técnica e funcional. Esta PR não altera código de produção, banco, regras, rotas ou interface. A existência de uma recomendação neste documento não significa que ela esteja implementada.

---

## 1. Decisão executiva

O AgueroFlow já possui módulos funcionais relevantes para Comercial, Compras, Estoque, Financeiro, Obras, Engenharia, Qualidade, SMS, RH, Patrimônio, Viagens e Operações. As etapas integradas até a PR #45 construíram uma base significativamente mais madura do que a auditoria histórica de 20/11.

O próximo salto não deve ser uma expansão indiscriminada do menu. Deve transformar os módulos atuais em um único fluxo de gestão, com dados mestres, regras compartilhadas, eventos auditáveis e custo/receita rastreáveis.

A plataforma deve conseguir acompanhar o ciclo completo:

1. Oportunidade, proposta, composição de custos e aprovação comercial.
2. Contrato, Projeto/Obra, orçamento-base e cronograma.
3. Planejamento de OS, pessoas, materiais, equipamentos e segurança.
4. Compras, recebimento, inspeção de materiais, estoque e reserva.
5. Execução em campo, HH, RDO, evidências, inspeções e qualidade.
6. Medição, faturamento, despesas, recebimentos e resultado da obra.
7. Histórico técnico, documentação final, indicadores e relacionamento com o cliente.

**Princípio central:** Projeto/Obra é o eixo de gestão do resultado. OS é o eixo de execução. Contrato, pessoa, material, ativo, unidade e centro de custo são entidades relacionadas que preservam sua identidade própria.

A IA, o WhatsApp, os relatórios e as automações devem consumir esse fluxo; não devem contorná-lo.

### 1.1 O que preservar

Não reescrever nem substituir sem justificativa técnica:

- Firebase Authentication, claims multiempresa e autenticação de API já existentes.
- Regras de segregação por empresa e os controles de Financeiro, Compras, SMS, Engenharia e Qualidade já implementados.
- Serviço transacional de Estoque, incluindo saldo, custo médio, transferência, idempotência e bloqueio de saldo negativo.
- Recebimento físico integrado à OC, estoque e movimentos.
- Conciliação de OC × NF-e × recebimento.
- Financeiro com contas a pagar/receber, liquidações, pagamentos parciais, autorizações e conciliação bancária.
- Fluxos existentes de Engenharia, Qualidade, SMS, RDO e Planejamento de Obras.
- Comercial com propostas, BOM, catálogo, importações, composição de custos e funil.
- Ponte Firebase do módulo Operações enquanto a migração gradual não estiver validada.

### 1.2 Regras para o roadmap

- Primeiro corrigir integridade, autorização e persistência; depois expandir funcionalidades.
- Reaproveitar coleções, serviços, tipos e telas existentes quando fizer sentido.
- Não criar cadastro paralelo para contrato, pessoa, material, ativo ou obra.
- Não misturar estimativa, dado histórico, dado confirmado e demonstração.
- Não preencher informação ausente com valor fictício ou identificador substituto.
- Não chamar custo estimado de custo realizado.
- Não tratar link externo como inventário confirmado de passagem, hospedagem ou fornecedor.
- Toda alteração crítica deve ser validada no servidor, não apenas por botões ou formulários.
- Toda operação financeira ou de estoque deve preservar origem, autor, horário, valor, unidade e chave de idempotência.
- Cada fase futura deve ter branch/PR própria, escopo limitado e critérios de aceite reproduzíveis.

---

## 2. Contexto e evidências da main analisada

### 2.1 Estado do repositório

A versão analisada contém:

- 24 módulos principais conectados em src/App.tsx.
- Serviços por domínio em src/services e rotas de backend em server/.
- Firebase Authentication, Firebase Admin, Firestore Rules e Storage Rules.
- Testes unitários e testes com Firebase Emulators.
- PR #44, com melhorias de checklist, transparência de resultados de viagem e permissões operacionais, integrada à main.
- PR #45, com o primeiro plano diretor de integração industrial, também integrada à main.

O CI da PR #45 concluiu com sucesso no commit que foi integrado. Isso valida aquela entrega documental e seu pipeline; não significa que toda funcionalidade descrita nos roadmaps esteja implementada.

### 2.2 Achados concretos ainda relevantes

Os itens abaixo foram conferidos na main analisada e devem orientar as próximas implementações.

| Área | Evidência observada | Consequência / direção |
|---|---|---|
| Permissões | src/permissions/areas.ts declara enforcement por área, mas firestore.rules usa collArea() e alguns recursos centrais permanecem sem mapeamento específico. | Reconciliar a matriz de permissões com Firestore, Storage e API; ocultar menu não é segurança. |
| OS | WorkOrdersModule.tsx atualiza status no cliente e grava order_events separadamente. | Criar transição de backend com validação, idempotência e histórico na mesma transação. |
| Criação de OS | A gravação da OS e o evento de criação também são operações separadas. | Tornar criação + evento + referências necessárias atômicos ou protegidos por saga idempotente claramente definida. |
| Inspeções | InspectionsModule.tsx cria registro diretamente com status concluída e completedAt. | Separar abertura, execução, revisão, aprovação e encerramento. |
| Checklists | checklistValidation.ts valida respostas na aplicação, mas as regras genéricas não repetem toda a validação de conclusão. | Finalização deve ser comandada pelo servidor e validada contra snapshot do template. |
| Unidades | Há default_unit em OS, inspeções, recorrências, estoque e conversão comercial. | Exigir unidade válida da organização em registros que dependem dela. |
| RH | rhPayrollService.ts tenta localizar field_worker pelo nome e mantém defaults como salário, taxa horária, matrícula e data de admissão. | ID mestre estável; dados ausentes geram pendência, nunca informação substituta. |
| Composição de custos | costCompositionService.ts usa localStorage em fallback de leitura/gravação e pode retornar demonstrações quando não encontra dados. | Falha de persistência deve aparecer como falha; demonstração precisa ser explícita e isolada. |
| Estoque | stockService.ts já é transacional, mas seu movimento genérico não persiste snapshot universal de custo unitário/total. | Persistir custo histórico por movimento e apropriar consumo à OS/Projeto. |
| Recorrências | Geração de OS continua manual; nextRunDate não fecha um ciclo automático de agendamento e idempotência. | Agendador durável, chave por recorrência/período e avanço de vencimento. |
| Relatórios | ReportsModule.tsx soma estimatedCost e exporta Custo_Estimado_BRL. | Manter estimado identificado; só apresentar realizado a partir de eventos reais de custo. |
| Projeto/Obra | Os tipos centrais ainda não oferecem uma identidade projectId comum entre os domínios analisados. | Introduzir modelo Projeto/Obra gradualmente, sem confundir contrato com execução. |
| Operações | OperationsModule.tsx carrega public/operacoes/index.html em iframe com bridge Firebase. | Migrar aba a aba, preservando dados e comportamento enquanto houver equivalência. |
| Servidor | server.ts permanece com aproximadamente 12.600 linhas. | Extrair routers por domínio gradualmente, sem refatoração integral. |
| Jobs e estado | Há estado persistido em arquivos sincronizados com Storage e rotinas com timers locais. | Garantir coordenação distribuída, persistência durável, lock, retries e idempotência antes de escalar instâncias. |
| Rate limit | Parte do rate limit é mantida em Map dentro do processo. | Compartilhar contadores quando houver múltiplas instâncias; não depender de memória local para limites globais. |
| Viagens | PR #44 removeu ofertas sintéticas; conectores sem inventário real ainda não representam disponibilidade confirmada. | Preservar distinção entre preço confirmado, estimativa e link para conferência externa. |

### 2.3 Correção de contexto histórico

A auditoria de 20/11 é referência histórica, não diagnóstico atual. Não reabrir como pendência itens que foram comprovadamente corrigidos nas etapas posteriores, como autenticação Firebase, segregação multiempresa, controles financeiros, parte das permissões de Compras, recebimento integrado, captura real de evidências em OS, Engenharia, Qualidade e SMS.

A revisão de cada etapa deve partir do código da main imediatamente anterior à implementação. Os achados acima são pontos de atenção confirmados na base analisada, mas ainda precisam ser revalidados no momento de cada PR.

---

## 3. Arquitetura funcional de destino

### 3.1 Projeto/Obra como entidade mestre de execução

Criar ou consolidar um cadastro central de Projeto/Obra, com relação explícita a contrato, cliente, unidade/planta e centro de custo.

Campos e relações recomendados, conforme aplicabilidade:

- ID permanente, orgId e código legível.
- Cliente e contatos autorizados.
- Um ou mais contratos, aditivos e versões comerciais.
- Unidade/planta e requisitos específicos do cliente.
- Centro de custo e departamento responsável.
- Proposta e versão aprovada que originaram a execução.
- Escopo, disciplinas, responsáveis e orçamento-base.
- Cronograma, marcos, linha de base e datas reais.
- Estado do projeto, riscos e impedimentos.
- Referências a OS, RDO, pessoas, compras, materiais, ativos, SMS, qualidade, medições, despesas e Financeiro.

**Separação obrigatória:**

- Contrato representa compromisso comercial/jurídico.
- Projeto/Obra representa execução, cronograma, custos e resultado.
- Unidade representa planta, estabelecimento ou local de execução.
- OS representa uma ordem de trabalho ou pacote executável.

Um contrato pode ter vários projetos, frentes ou unidades. Não assumir relação 1:1 sem regra explícita.

### 3.2 Cadastro mestre de pessoas

Eleger rh_employees como origem oficial da identidade, após saneamento dos dados legados.

- rh_directory deve ser uma projeção operacional sem informações salariais.
- field_workers deve ser uma projeção de atributos necessários ao campo.
- collective_asset_workers deve referenciar a pessoa mestre, não criar outra identidade.
- Segurança, EPI, treinamento e alocação usam ID estável.
- Nunca reconciliar registros automaticamente só por nome.
- CPF, dados bancários, salários, ASO e dados médicos precisam de autorização específica e minimização de acesso.
- Dados obrigatórios ausentes permanecem pendentes; não usar salário, taxa horária, matrícula, admissão ou certificação inventados.

### 3.3 Catálogo mestre de materiais e serviços

- items é a identidade operacional/estoque do material.
- commercial_materials pode permanecer como projeção comercial durante a migração, referenciando o item mestre quando houver equivalência confirmada.
- Preservar serviços e mão de obra como tipos de catálogo com atributos próprios.
- Definir SKU, descrição normalizada, unidade, NCM quando aplicável, fabricante, especificação e status.
- Manter alias, descrição de fornecedor e equivalência sem fundir automaticamente materiais tecnicamente diferentes.
- Guardar fonte, data e tipo de preço: confirmado, cotado, histórico ou estimado.

### 3.4 Livro de fatos de custo e receita

O custo realizado deve ser calculado a partir dos eventos de origem, não digitado em cada dashboard.

Eventos candidatos:

- HH aprovado por pessoa, atividade, OS e obra.
- Consumo, devolução, perda e transferência de material.
- Recebimento de compras e custo de aquisição.
- Utilização, locação e manutenção de ativos.
- Despesas, adiantamentos, diárias e terceiros.
- Medições aprovadas, faturamento, retenções e recebimentos.

Cada evento financeiro/operacional precisa de:

- orgId, projectId quando aplicável, contractId, orderId e costCenterId quando aplicáveis;
- entidade de origem e chave idempotente;
- valor, quantidade, unidade e moeda;
- data de competência e data de registro;
- autor, aprovador e estado;
- snapshot dos dados relevantes na época;
- evento de estorno/ajuste, em vez de apagar o histórico.

Separar conceitos:

- **Previsto:** orçamento-base, revisão aprovada e planejamento.
- **Comprometido:** OC, contrato, reserva e obrigação aprovada.
- **Realizado:** consumo, HH, despesa, recebimento ou receita efetivamente registrados e validados.
- **Projetado:** previsão atualizada para completar a obra.

### 3.5 Fluxo de estados e eventos

- Estados de OS, inspeção, qualidade, medição, compra e aprovação precisam de máquinas de estado documentadas.
- A interface solicita transições; o servidor valida usuário, empresa, área, papel, estado anterior, pré-condições e concorrência.
- Estado atual e evento correspondente devem ser atômicos ou protegidos por estratégia idempotente equivalente.
- Eventos históricos críticos são append-only.
- Mudança de modelo/template não altera registros passados.
- Reenvio de requisição, duplo clique, retry e execução concorrente não podem duplicar efeitos.

---

## 4. Evolução dos 24 módulos existentes

A numeração abaixo acompanha os módulos principais conectados em src/App.tsx. Recursos que hoje são subáreas não devem virar módulos paralelos sem justificativa.

### 4.1 Painel / Dashboard

**Manter:** visão geral, filtros, indicadores e Central de Pendências.

**Evoluir:**
- Visão executiva, gerente, supervisor e encarregado.
- Filtros por Projeto/Obra, contrato, unidade, OS, centro de custo e período.
- Previsto × comprometido × realizado × projetado.
- Margem atual e projeção até o encerramento.
- Cronograma planejado versus avanço físico.
- OS atrasadas, impedimentos, horas improdutivas e retrabalho.
- Compras pendentes, materiais críticos e recebimentos divergentes.
- Inspeções, não conformidades, SMS e treinamentos vencendo.
- Última atualização, fonte e cobertura do indicador.
- Alertas acionáveis que abrem o registro de origem.

**Critério:** nenhuma estimativa, demonstração ou informação incompleta é apresentada como realizado ou confirmado.

### 4.2 Ordens de Serviço e Execução

**Manter:** kanban, timeline, planejamento, responsáveis, diálogo, evidências e histórico.

**Evoluir:**
- Máquina de estados no backend, com transições válidas por tipo de serviço e perfil.
- Criação e transição com evento de timeline/auditoria consistente.
- Pré-condições: unidade/contrato/Projeto válidos, equipe, habilitações, APR/PT, checklist, materiais e recursos quando aplicáveis.
- Apontamento real de HH por pessoa, atividade, função e turno.
- Horas produtivas/improdutivas com motivo.
- Reserva, consumo, devolução e perda de materiais.
- Equipamentos, horas, locações e indisponibilidade.
- Evidência real com Storage privado, horário e metadados.
- Aceite do cliente, retrabalho, impedimentos e reabertura controlada.
- Custo previsto e realizado por OS.
- Encerramento técnico separado de encerramento administrativo/financeiro.

**Critério:** uma alteração no cliente não consegue concluir OS sem as validações exigidas no backend.

### 4.3 Aprovações LPU

**Evoluir:**
- LPU por cliente, contrato, unidade e escopo.
- Vigência, reajuste, versão e histórico.
- Itens ligados ao catálogo mestre.
- Quantidade prevista, executada, medida e aprovada.
- Alçadas e aprovação de exceção.
- Integração com boletim de medição e faturamento.
- Não permitir aprovação apenas visual sem efeito de negócio registrado.

### 4.4 OS Recorrentes

**Evoluir:**
- Agendador durável e execução independente de sessão aberta.
- Frequência diária, semanal, mensal e regras personalizadas.
- Avanço automático de nextRunDate.
- Idempotência por recorrência/período.
- Pausa, retomada, encerramento e exceções de calendário.
- Modelo com checklist, materiais, equipe, ativo e tempo padrão.
- Preventivas por ativo, planta e contrato.
- Histórico de geração, falha e próxima execução.

**Critério:** duas instâncias ou um retry não criam duas OS para a mesma ocorrência programada.

### 4.5 Checklists

**Preservar:** melhorias de respostas vazias, progresso, itens obrigatórios e tratamento de respostas não conformes incluídas no PR #44.

**Evoluir:**
- Finalização no backend, revalidando respostas e template.
- Snapshot/versionamento da versão do template.
- Suporte completo a sim/não, múltipla escolha, texto, número, foto e assinatura.
- Faixa aceitável, criticidade e instruções por item.
- Evidência e observação por item.
- Não conformidade crítica abre ocorrência e pode bloquear OS.
- Assinatura e responsável quando exigidos.
- Associação a OS, inspeção, etapa e ativo.

**Critério:** edição posterior de um template nunca reescreve a execução histórica.

### 4.6 Inspeções, Qualidade e Comissionamento

**Evoluir fluxo existente:**
- Agendada, em execução, revisão pendente, devolvida, aprovada e encerrada.
- Inspetor, revisor, aprovador, datas e histórico.
- Critérios de aceitação, valores medidos e evidências por tipo.
- Vínculo com OS, Projeto, ativo, Engenharia e checklist.
- Correção e verificação de eficácia.

**Diferenciais industriais:**
- Mapa de solda e passaporte por junta.
- Soldador, sinete, EPS/WPS/PQR e qualificação.
- Ensaios LP/PT, PM/MT, US/UT e RX/RT com laudos.
- Testes hidrostáticos/pneumáticos e estanqueidade.
- Torque, alinhamento e inspeção dimensional.
- Instrumentos, calibração e validade.
- Certificados de materiais, corrida, lote e fabricante.
- Punch list, comissionamento, as built e aceite.
- Data book/dossiê técnico por Projeto/Obra.

**Critério:** inspeção não nasce concluída; aprovação requer evidências e permissão.

### 4.7 Itens e Serviços

**Evoluir:**
- Catálogo mestre compartilhado com Comercial, Estoque e Compras.
- SKU, código alternativo, descrição original e normalizada.
- Unidade de medida e histórico de conversões.
- NCM, atributos dimensionais, material, classe e fabricante.
- Relações de equivalência e substituição técnica aprovadas.
- Preço de referência com origem, fornecedor e data.
- Distinguir serviço, peça, consumível e mão de obra.
- Auditoria de alterações críticas de especificação/unidade.

### 4.8 Estoque

**Preservar:** applyStockMovement, transações atômicas, custo médio, bloqueio de saldo negativo, transferências e idempotência por sourceRef.

**Evoluir:**
- Reserva por OS, Projeto e contrato.
- Almoxarifado central e estoque por obra.
- Em trânsito, recebido, inspecionado, reservado, consumido e devolvido.
- Snapshot de custo unitário e total por movimento.
- Apropriação de consumo à OS com método de valorização registrado.
- Lote, validade, fabricante, série, corrida e certificado.
- Perda, sucata, devolução e transferência.
- Inventário rotativo e QR Code.
- Ponto de reposição e RC sugerida a partir de necessidade real.
- Rastreabilidade de material de cliente versus material próprio.

**Critério:** cada movimento conserva origem, custo e saldo antes/depois, com atualização atômica.

### 4.9 Ocorrências

**Evoluir:**
- Taxonomia de operação, manutenção, qualidade, SMS e meio ambiente.
- Vínculo com Projeto, OS, pessoa, ativo, planta e contrato.
- 5 Porquês, Ishikawa e classificação de impacto.
- Plano 5W2H, responsável, prazo e evidências.
- Aprovação da correção e verificação de eficácia.
- Indicadores de recorrência por causa, disciplina, cliente e ativo.
- Conversão em OS corretiva sem perder o vínculo original.
- Histórico append-only de eventos relevantes.

### 4.10 Relatórios

**Evoluir:**
- Resultado por Projeto/Obra, contrato e OS.
- Previsto × comprometido × realizado × projetado.
- HH por função, equipe, atividade e disciplina.
- Custo de materiais, equipamentos, terceiros e despesas.
- Margem e projeção ao término.
- Cronograma, curva S, atraso e produtividade.
- Consumo, perdas, retrabalho e compras fora do planejamento.
- Qualidade, incidentes, não conformidades e pendências.
- Medição, faturamento, retenção e recebimento.
- Exportação controlada e rastreável para diretoria e contabilidade.
- Fonte, período, atualização e limitações de cobertura.

**Critério:** relatórios não estimam custo realizado a partir de estimatedCost; cada classe de valor tem definição e origem.

### 4.11 Suporte

**Evoluir:**
- Chamado, categoria, prioridade e impacto.
- Responsável, equipe, SLA e escalonamento.
- Comentários, anexos, notificações e histórico.
- Base de conhecimento e artigos relacionados.
- Indicadores de primeira resposta, resolução e reincidência.
- Visibilidade por empresa e solicitante.

### 4.12 AgueroFlow IA

**Evoluir em etapas:**

1. Consulta autorizada e explicação com fonte e horário.
2. Análise de desvios e preparação de rascunhos.
3. Ações somente após confirmação explícita.

Ampliar consultas para:
- Projetos, contratos, cronogramas e margens.
- OS, HH, impedimentos, RDO e produtividade.
- Compras, recebimento, estoque, reservas e faltas.
- RH, disponibilidade, habilitações e SMS.
- Engenharia, inspeções, qualidade e punch list.
- Medições, despesas, contas e fluxo de caixa.

Ações assistidas possíveis:
- Preparar RC ou cotação.
- Criar rascunho de OS.
- Elaborar relatório de obra.
- Preparar composição comercial.
- Sugerir equipe e sequência de trabalho.
- Criar plano de ação para ocorrência.

Toda ferramenta deve validar empresa, área, papel, escopo e registro; aplicar limites de operação; exigir confirmação; usar idempotência; registrar auditoria. Não autorizar escrita irrestrita por linguagem natural.

### 4.13 Estrutura, Contratos e Cadastro Mestre

**Evoluir:**
- Entidade central Projeto/Obra.
- Relação entre contratos, aditivos, projetos, unidades e centros de custo.
- Cadastro de cliente/planta com requisitos técnicos, documentais e de SMS.
- Cargos, CBO, competências e matriz de qualificação.
- Identidades de pessoa, material e ativo.
- Vigência, responsável e histórico de contrato.
- Catálogo de permissões por recurso e ação.
- Separação dos dados pessoais, médicos, salariais, operacionais e financeiros.

### 4.14 Configurações

**Evoluir:**
- Parâmetros de negócio com versão, vigência e responsável.
- Alçadas por valor, margem, categoria, centro de custo e empresa.
- Regras por contrato, cliente e planta.
- Requisitos de OS, checklist, SMS e inspeções por atividade.
- Parâmetros tributários/financeiros com aprovação e vigência.
- Matriz única de autorização aplicada em UI, API, Firestore e Storage.
- Histórico de mudança e rollback controlado.
- Testes automatizados para permissão positiva e negativa.

### 4.15 Construção, Obras, RDO e SMS

**Planejamento:**
- EAP, predecessoras, dependências e baseline aprovada.
- Planejamento semanal de equipes, materiais e equipamentos.
- Produção planejada versus executada.
- Alertas de atraso, impedimento e caminho crítico.
- Curva S e projeção de conclusão.

**RDO:**
- Pessoas por ID, função, atividade, turno e horas.
- Equipamentos por patrimônio e horas de operação.
- Clima, atividade, impedimento e paralisação.
- Avanço físico por escopo e evidência.
- Aprovação e histórico de correção.
- Sincronização offline segura.

**SMS:**
- Matriz de treinamentos por cargo, atividade e planta.
- ASO e dados médicos sob acesso restrito.
- Integração de segurança por cliente/planta.
- Bloqueio de alocação quando requisitos obrigatórios não forem atendidos.
- Ficha de EPI, CA, entrega, devolução e validade.
- DDS e participação.
- Inspeções de equipamentos de segurança.
- Indicadores de incidentes e ações corretivas.

Não gerar aptidão, treinamento, certificado, ASO ou liberação automaticamente. Requisitos e evidências devem ser provenientes de registros confiáveis e válidos.

### 4.16 Patrimônio / Bens Coletivos

**Preservar:** cadastro, checkout/devolução, manutenção, calibração e integração atual.

**Evoluir:**
- Pessoa mestre e Projeto/Obra em todas as alocações.
- QR Code por ferramenta/ativo.
- Localização, responsável e histórico.
- Preventiva, corretiva e inspeção.
- Bloqueio no backend quando equipamento estiver indisponível ou com calibração vencida.
- Certificados e documentos privados.
- Custo de diária, locação e utilização por OS.
- Indicadores de disponibilidade, utilização, falha e custo.

A gestão de ativos tipo CMMS deve ampliar este módulo e Estrutura, não criar um cadastro concorrente.

### 4.17 RH / Salários

**Direção:** administrar pessoas e custos de campo, sem transformar o AgueroFlow em folha de pagamento completa.

**Evoluir:**
- Identidade única e ID estável.
- Admissão, documentação, pendência e aprovação.
- Cargo, CBO, departamento e competências.
- Certificados, NRs e qualificações por vigência.
- ASO e dados médicos segregados.
- Disponibilidade, férias, afastamento e desligamento.
- Alocação histórica por Projeto/Obra e OS.
- Apontamento de horas aprovado.
- Custo real por pessoa, função, atividade e projeto.
- Exportação de variáveis para folha/contabilidade.
- Proteção específica de salários e dados bancários.

Dados faltantes devem ficar como pendência. Tabelas trabalhistas/previdenciárias precisam de vigência e validação contábil; não embutir parâmetros de ano anterior como regra permanente.

### 4.18 Comercial / OrçaÁgil

**Evoluir:**
- Composição calculada por produtividade e quantidades técnicas.
- HH por função, disciplina e atividade.
- Materiais, frete, tributos, equipamentos, terceiros e mobilização.
- BDI, contingência e margem configuráveis e transparentes.
- Encargos e tributos por regime e vigência, validados pela contabilidade.
- Preço com origem, fornecedor, data e qualidade da informação.
- Comparação de revisões e alterações de escopo.
- Aprovação por margem/alçada.
- Envio, visualização, aceite, rejeição e assinatura via integração.
- Congelamento da proposta e composição aprovadas.
- Conversão de proposta ganha em contrato e Projeto/Obra com baseline.
- Modelos genéricos separados de dados históricos de clientes específicos.

**Pontos de confiabilidade obrigatórios:**
- Remover fallback silencioso de localStorage na persistência compartilhada.
- Remover seed automático disfarçado quando Firestore estiver vazio ou indisponível.
- Identificar claramente Dados de demonstração.
- Não substituir unidade, cliente ou contrato ausente por default.
- Preservar a revisão aprovada mesmo quando uma nova proposta ou revisão for criada.

### 4.19 Compras e Suprimentos

**Preservar:** RC, cotações, OC, fornecedores, recebimento, conciliação com NF-e e estoque.

**Evoluir:**
- RC vinculada à OS, BOM, Projeto e centro de custo.
- Reserva e previsão de materiais.
- Alçadas por valor, grupo e urgência.
- Homologação documental e técnica de fornecedor.
- Desempenho de prazo, qualidade, preço e atendimento.
- Aprovação de substituição técnica.
- Contratos e pedidos recorrentes.
- Previsão de compras conforme cronograma.
- Alertas de atraso, divergência e entrega parcial.
- Lote/certificado ligado ao recebimento.

### 4.20 Financeiro

**Preservar:** NF-e, contas a pagar/receber, autorizações, liquidações, pagamentos parciais e conciliação bancária.

**Evoluir:**
- Apropriação por Projeto, contrato, OS e centro de custo.
- Compromissos derivados de OC e contrato.
- Custos realizados de HH, estoque, equipamentos e despesas.
- Medição, faturamento, retenções e recebimento.
- Provisão e fluxo de caixa projetado.
- Margem e resultado por projeto/contrato/cliente.
- Conciliação de despesas e receitas operacionais.
- Exportação auditável para Protheus/contabilidade.

O AgueroFlow permanece como camada operacional e gerencial; não substitui o Protheus nem a escrituração fiscal/contábil.

### 4.21 Viagens e Despesas de Campo

**Direção:** priorizar gestão de despesas e missões; não construir agregador de tarifas sem inventário real.

**Evoluir:**
- Viagem, missão, hospedagem, transporte, alimentação e diária.
- Adiantamento, reembolso, prestação de contas e comprovante.
- OCR com confirmação humana.
- Duplicidade de comprovante e prevenção de reembolso repetido.
- Aprovação por alçada e política.
- Colaborador, aprovador, período, Projeto, OS, contrato e centro de custo.
- Exportação controlada para o Financeiro/Protheus.
- Fonte, data e status de verificação de qualquer oferta externa.

### 4.22 Operações legado

**Direção:** migração gradual sem reescrita integral.

- Inventariar telas e rotinas usadas.
- Mapear coleções e bridge.
- Identificar funcionalidades já cobertas pelos módulos nativos.
- Migrar uma aba por vez para React.
- Reconciliar dados e permissões.
- Criar testes de equivalência.
- Manter compatibilidade e rollback até validação.
- Desligar o iframe somente após aceite de cada fluxo.

### 4.23 Marketing / Portfólio Técnico

**Evoluir para marketing B2B industrial:**
- Cases e obras concluídas.
- Escopo, disciplinas, equipamentos e processos.
- Fotos/vídeos autorizados.
- Atestados, certificações e capacidade técnica.
- Segmentos e clientes atendidos.
- Book institucional e apresentações comerciais.
- Biblioteca por cliente, obra e tipo de serviço.
- Aprovação de publicação e registro de autorização.

Separar conteúdo interno de conteúdo liberado. Não publicar dados, desenhos, fotos ou documentos do cliente sem autorização registrada.

### 4.24 WhatsApp e Automações

**Evoluir:**
- Contexto por empresa e usuário.
- Identidade de telefone e permissões.
- Consultas autorizadas ao ERP.
- Rascunhos e ações assistidas com confirmação.
- Alertas por destinatário, papel, horário e preferência.
- Histórico de envio, falha, entrega e reprocessamento.
- Opt-out e preferências de comunicação.
- Fila durável, retry, backoff e dead-letter.
- Scheduler persistente e lock compartilhado.
- Avaliar API oficial/BSP por custo, limites e continuidade operacional.

Nenhuma rotina crítica deve depender apenas de um timer de uma instância do servidor ou duplicar envios em execução concorrente.

---

## 5. Novas capacidades recomendadas

### 5.1 Medições e Boletim de Medição — novo módulo recomendado

Este é o novo módulo com maior prioridade funcional porque fecha a ligação entre execução física e receita.

**Responsabilidades:**
- Itens contratuais, LPU, escopo e unidade de medição.
- Quantidade prevista, executada no período e acumulada.
- Memória de cálculo e evidência da execução.
- Boletim por período e revisão.
- Aprovação interna e envio ao cliente.
- Aprovado, parcialmente aprovado, glosado ou devolvido.
- Histórico de versões, comentários e justificativas.
- Retenção, reajuste e regra contratual aplicável.
- Integração com faturamento/contas a receber após aprovação.
- Relatório de medido, aprovado, faturado e recebido.

**Critério:** nenhuma medição gera receita faturável sem versão aprovada e vínculo contratual rastreável. O módulo não dispara pagamento nem substitui emissão fiscal.

### 5.2 Gestão de Ativos / CMMS — ampliar Estrutura e Patrimônio

Não criar cadastro paralelo. Evoluir os ativos e bens existentes com:

- criticidade, fabricante, modelo, número de série e localização;
- plano preventivo por calendário, horímetro ou ciclo;
- manutenção corretiva, preventiva e preditiva;
- falhas, causa, peças, HH e custos;
- disponibilidade e utilização;
- indisponibilidade durante manutenção/calibração;
- vínculo de ativo com OS, equipe, obra e centro de custo;
- histórico técnico e indicadores de confiabilidade.

O CMMS deve complementar a gestão de ativos existente, não replicá-la.

### 5.3 Portal do Cliente — novo módulo futuro

Ambiente externo, isolado por cliente/contrato/Projeto, para:

- acompanhar cronograma e marcos liberados;
- consultar RDO e evidências autorizadas;
- revisar e aprovar medições;
- aprovar ou comentar documentação técnica;
- acompanhar inspeções, punch list e pendências liberadas;
- registrar aceite de serviços;
- consultar histórico e documentos de entrega.

**Segurança obrigatória:** usuário externo não é membro interno da empresa. Criar identidade, escopo e autorização próprios por cliente/contrato/projeto, links com expiração quando aplicável e trilha de acesso. Não reutilizar permissões internas ou expor documentos por URL pública.

---

## 6. Melhorias estruturais transversais

### 6.1 Segurança por recurso, ação e finalidade

Criar inventário único de autorização que responda:

- quem pode ler, criar, editar, aprovar, excluir e exportar;
- qual empresa, Projeto, contrato, unidade ou registro pode acessar;
- se contém salário, dado bancário, dado médico, documento pessoal ou informação de cliente;
- qual controle se aplica em UI, API, Firestore e Storage.

Reconciliar:
- AREA_IDS e AREAS em src/permissions/areas.ts;
- middleware requireArea/requireRole;
- collArea/areaRead/areaWrite nas regras Firestore;
- regras de Storage;
- rotas Express e ações server-side;
- permissões de IA e automações.

A propriedade enforcedInDatabase deve refletir a proteção real. Para recursos sem regra própria, definir explicitamente a área responsável antes de declarar enforcement.

Testes obrigatórios:
- sem autenticação;
- empresa errada;
- mesma empresa sem acesso à área;
- acesso somente leitura tentando gravar;
- papel sem alçada tentando aprovar;
- usuário de outra empresa tentando acessar arquivo;
- master e membro autorizado;
- recurso sensível com escopo restrito.

### 6.2 Persistência e tarefas duráveis

- Inventariar todos os dados em arquivos locais, JSON, sessões e Storage.
- Migrar estado operacional crítico para banco compartilhado ou serviço apropriado.
- Storage privado para arquivos; metadados e vínculo no banco.
- Usar fila para OCR, importações, notificações, exportações e tarefas longas.
- Retry com backoff, idempotência, lock e dead-letter.
- Lock distribuído para rotinas que não podem concorrer.
- Rate limit compartilhado quando houver múltiplas instâncias.
- Política de backup, retenção, recuperação e teste periódico de restauração.
- Distinguir cache local de fonte oficial persistida.

A sincronização de arquivos não deve ser usada como substituto de transação de negócio ou coordenação concorrente.

### 6.3 Modularização do servidor

Extrair gradualmente rotas e regras de server.ts por domínio:

- OS e execução.
- Comercial e contratos.
- Projeto/Obra e Construção.
- Compras e Estoque.
- RH e admissões.
- SMS e Segurança.
- Qualidade e Engenharia.
- Financeiro e NF-e.
- Viagens e despesas.
- IA, WhatsApp e automações.
- Relatórios e exportações.

Preservar URL, autenticação, middleware, payload e comportamento. Cada extração deve ter teste de contrato e permitir rollback.

### 6.4 Contratos de dados e migrações

- Padronizar IDs, orgId, timestamps, estados e referências.
- Adotar projectId progressivamente onde o vínculo for semanticamente válido.
- Preservar contractId, unitId, costCenterId, orderId e assetId independentes.
- Não sobrescrever dados históricos com defaults novos.
- Migração em fases: inventário, dry-run, relatório de inconsistências, backfill, validação, leitura dual temporária, corte e limpeza posterior.
- Toda migração deve ser idempotente, retomável e auditável.
- Atualizar docs/firestore-collections.md após mudança de coleção/regra.

### 6.5 Documentos e evidências

- Storage privado com caminhos por empresa e finalidade.
- Validar MIME real, extensão, tamanho e relação com o registro.
- Metadados com hash, autoria, data, revisão e status.
- Versionamento de documento técnico.
- Retenção e descarte de dados conforme política.
- Anexos salariais/médicos e documentos de cliente com regras próprias.
- Não colocar assinatura, foto ou PDF grande em documentos Firestore como base64.

### 6.6 Operação de campo e offline

- PWA para OS, checklist, RDO, inspeções e evidências.
- Cache mínimo e protegido.
- Fila local com identificador idempotente.
- Indicação visual de pendente, sincronizado e rejeitado.
- Resolver conflitos com revisão humana quando necessário.
- Revalidar autorização, versão e pré-condições no servidor durante sincronização.
- Não indicar concluído antes da confirmação central quando a regra exigir.

### 6.7 Observabilidade e continuidade

- Logs estruturados com correlation ID.
- Métricas de latência, erros, retries e volume.
- Alertas para jobs parados, falha de integração e fila acumulada.
- Painel de saúde por serviço/conector.
- Registro de deploy e versão.
- Runbook para falhas de Firebase, SEFAZ, WhatsApp, e-mail, IA e armazenamento.
- Plano de rollback, backup e recuperação testada.

---

## 7. Roadmap executivo priorizado

### Fase 0 — Integridade e controles obrigatórios (P0)

1. Matriz de permissões por recurso/ação e cobertura de Firestore, Storage e API.
2. Máquina de estados e transições de OS no backend.
3. Criação/transição com eventos de timeline e auditoria consistentes.
4. Finalização de checklist no backend com snapshot do template.
5. Inspeção com fluxo de execução, revisão e aprovação.
6. Remover default_unit e exigir unidade válida nas operações críticas.
7. Remover defaults fictícios e associação por nome no RH; criar relatório de pendências legadas.
8. Corrigir persistência do OrçaÁgil, sem fallback silencioso e seed automático.
9. Garantir preço, demonstração e histórico claramente identificados.
10. Verificar documentos, arquivos, assinaturas, anexos e dados sensíveis.
11. Criar testes negativos de permissão e concorrência para os fluxos críticos.

**Saída obrigatória:** nenhum processo crítico pode ser aprovado/concluído sem autorização, pré-condições e histórico verificáveis no servidor.

### Fase 1 — Cadastros mestres e Projeto/Obra (P1)

1. Modelo de Projeto/Obra e relação com contrato, unidade e centro de custo.
2. Inventário e migração de vínculos existentes.
3. Pessoa mestre e projeções por ID estável.
4. Catálogo mestre de material com integração Comercial/Estoque/Compras.
5. Identidade e cadastro técnico de ativos.
6. Padronização gradual dos contratos de dados.
7. Permissões finais por recurso.

**Saída:** novos registros relevantes passam a compartilhar identidade de Projeto/Obra, pessoa, material e ativo sem perder referências legadas.

### Fase 2 — OS e operação integrada (P1)

1. Proposta ganha gera contrato/projeto e baseline.
2. Cronograma cria pacotes de trabalho e OS.
3. Equipe é validada por RH/SMS e disponibilidade.
4. Material é reservado e falta gera RC.
5. Compra, recebimento e inspeção alimentam estoque.
6. OS registra HH, consumo, equipamentos, RDO e evidências.
7. Checklist, inspeções, qualidade e aceite concluem a execução.

**Saída:** ciclo de execução completo sem redigitar a mesma informação em módulos distintos.

### Fase 3 — Custo realizado, medição e resultado (P1)

1. Ledger de HH aprovado.
2. Ledger de material consumido/devolvido/perdido.
3. Custos de equipamento, terceiros e despesas.
4. Compromissos de OC/contrato/reserva.
5. Medição e boletim com revisão e aprovação.
6. Receita, faturamento, retenções e recebimentos.
7. Previsto × comprometido × realizado × projetado.
8. Margem e projeção de custo ao término.

**Saída:** direção consegue responder quanto a obra deveria custar, quanto está comprometido, quanto efetivamente custou, quanto foi medido/faturado/recebido e qual é a margem.

### Fase 4 — Diferenciais industriais (P2)

1. Mapa de juntas e passaporte de soldagem.
2. EPS/WPS/PQR e qualificação de soldadores.
3. END, ensaios, instrumentos e calibração.
4. Certificados e rastreabilidade de materiais.
5. Punch list, comissionamento, as built e data book.
6. CMMS e confiabilidade de ativos.

**Saída:** dossiê industrial consistente e auditável por Projeto/Obra.

### Fase 5 — Plataforma ampliada (P2)

1. Portal do Cliente com escopo externo isolado.
2. IA sobre dados integrados e autorizados.
3. Ações assistidas com confirmação e auditoria.
4. Jobs duráveis e notificações.
5. PWA/offline.
6. Migração gradual do Operações legado.
7. Portfólio técnico.
8. Suporte/SLA e observabilidade completa.

**Saída:** automações e usuários externos consomem dados confiáveis com autorização explícita.

---

## 8. Jornada ponta a ponta obrigatória de teste

Criar uma suíte E2E em ambiente isolado que simule:

1. Criar cliente, unidade/planta e oportunidade.
2. Montar BOM e composição de custos.
3. Importar cotação e identificar origem/confiança dos preços.
4. Aprovar revisão e registrar proposta ganha.
5. Criar contrato e Projeto/Obra com vínculos válidos.
6. Congelar orçamento-base e cronograma.
7. Criar OS e validar unidade, contrato e centro de custo.
8. Planejar equipe, materiais e equipamentos.
9. Bloquear pessoa sem treinamento/qualificação obrigatória.
10. Criar e aprovar APR/PT quando aplicável.
11. Reservar materiais e gerar RC em caso de falta.
12. Aprovar cotação/OC e receber entrega parcial.
13. Conciliar OC × NF-e × recebimento.
14. Registrar lote/certificado e entrada no estoque.
15. Consumir/devolver material na OS com custo rastreável.
16. Registrar HH aprovado, RDO, equipamento e impedimento.
17. Executar checklist com versão congelada.
18. Executar inspeção e revisão técnica.
19. Abrir, corrigir e verificar não conformidade.
20. Aprovar medição e registrar eventual glosa.
21. Apropriar despesas, custo, faturamento e recebimentos.
22. Conferir resultado previsto, comprometido, realizado e projetado.
23. Conferir dossiê técnico e documentos liberados.
24. Testar acesso entre empresas, áreas, arquivos e portal externo.

Cobrir sucesso, falha, concorrência, timeout, retry, operação repetida, rollback e tentativa sem permissão.

---

## 9. Critérios de aceite por PR futura

Cada PR de implementação deve:

- Partir da main atualizada e registrar o commit-base.
- Inspecionar os serviços, tipos, coleções e telas existentes antes de alterar.
- Preservar módulos, rotas, autenticação, multiempresa, permissões e identidade visual.
- Ter escopo de domínio pequeno e reversível.
- Separar migração de dados de mudança de interface.
- Definir critérios de aceite antes de implementar.
- Incluir testes unitários para regras puras.
- Incluir testes de emulador para autorização, escrita, transição e concorrência.
- Incluir integração/E2E proporcional ao risco.
- Demonstrar casos permitidos e negados.
- Documentar campos, índices, coleções, regras e compatibilidade.
- Atualizar inventário de coleções e contratos.
- Documentar resultado real de lint, testes, build e emuladores.
- Declarar o que foi implementado, o que ficou parcial e o que continua no roadmap.
- Não declarar teste manual, CI ou comportamento como aprovado sem evidência verificável.
- Não incluir seed, preço, usuário, unidade, coordenada, salário ou certificado fictício em produção.

Merge e deploy permanecem sujeitos à revisão e aprovação do responsável pelo repositório.

---

## 10. Fora do escopo imediato

- Reescrita integral do AgueroFlow, server.ts ou módulo Operações.
- Criação de módulos paralelos para entidades que já existem.
- Substituição do Protheus ou do sistema fiscal/contábil.
- Folha de pagamento completa.
- Agregador próprio de viagens sem inventário real e contrato de integração.
- Ações de escrita irrestritas pela IA.
- Portal do cliente antes de existir segregação externa própria.
- Offline amplo antes de estabilizar estados, eventos e idempotência.
- Refatoração estética de módulos enquanto houver inconsistência de dados ou autorização.
- Dashboards avançados antes de existir custo/receita realizados confiáveis.

---

## 11. Resultado esperado

O AgueroFlow deve operar como plataforma especializada para empresas de montagem, tubulações, caldeiraria, manutenção e instalações industriais.

Para qualquer Projeto/Obra, o sistema deve conseguir responder com dados rastreáveis:

**O que foi vendido? Qual escopo e orçamento foram aprovados? O que foi planejado? Quem executou? Quantas horas foram aplicadas? Quais materiais e equipamentos foram usados? Quais riscos foram controlados? Quais inspeções foram aprovadas? O que foi medido, faturado e recebido? Quanto foi comprometido, quanto custou e qual foi o resultado?**

A evolução proposta prioriza integridade e segurança, depois cadastros mestres e execução integrada, seguida por custo realizado/medição e, finalmente, diferenciais industriais e expansão para clientes.

**A decisão recomendada é: não iniciar outro módulo operacional até fechar a Fase 0 e estabelecer a fundação Projeto/Obra, pessoa e catálogo mestre.** A única nova capacidade que merece planejamento funcional em paralelo é Medições/Boletim, porque fecha a ligação entre execução e receita; sua implementação, porém, depende de contratos, OS, escopo e dados de medição confiáveis.
