# AgueroFlow — Plano diretor de integração industrial e evolução por módulos

**Base:** main no commit 15441c421b9baa55fff6dbf288bf5499945d72f7  
**Referência:** PR #44 — endurecimento P0, integrado à main em 25/11/2026  
**Objetivo:** consolidar a visão de evolução do AgueroFlow como plataforma integrada de gestão comercial, contratos, montagem, manutenção e serviços industriais.  
**Natureza desta entrega:** planejamento técnico e funcional. Este documento não declara como implementadas as funcionalidades propostas.

---

## 1. Direção estratégica

O próximo salto do AgueroFlow não deve ser a criação indiscriminada de novos módulos. A prioridade é fazer os módulos existentes compartilharem cadastros, regras, eventos e informações de origem, de modo que um dado seja registrado uma vez e reaproveitado por todo o ciclo operacional.

A plataforma deve conectar:

1. oportunidade, proposta, composição de custos e contrato;
2. projeto/obra, orçamento-base, cronograma e ordens de serviço;
3. pessoas, qualificações, segurança e disponibilidade;
4. requisições, compras, recebimentos, estoque e consumo;
5. execução, RDO, inspeções, qualidade e aceite;
6. despesas, medições, faturamento, recebimentos e resultado por obra.

**Princípio central:** Projeto/Obra é o eixo de gestão do resultado; Ordem de Serviço é o eixo de execução. Os dois precisam compartilhar identidades e vínculos consistentes.

A IA e o WhatsApp devem acompanhar esse ciclo, mas não substituir validações, permissões ou registros transacionais.

## 2. Contexto da versão analisada

A revisão considera a main após a integração do PR #44. A aplicação possui 24 módulos principais importados em src/App.tsx, serviços por domínio, Firebase Authentication, claims de empresa/área, regras Firestore/Storage, rotas de servidor e testes unitários e de emuladores.

### 2.1 Fundamentos existentes que devem ser preservados

- Autenticação Firebase e verificação de ID token no servidor.
- Isolamento multiempresa por claims e regras de banco.
- Catálogo de permissões por área com níveis de visualização e edição.
- Serviços de estoque com transações, bloqueio de saldo negativo, custo médio e movimentos rastreáveis.
- Recebimento físico de compras integrado à OC, saldo de estoque e movimentos em uma transação.
- Financeiro com contas a pagar, contas a receber, liquidações, conciliação bancária e integração de NF-e.
- Base de Segurança/SMS com permissões de trabalho, treinamentos, EPI e registros no backend.
- Registros de Engenharia, RDO e Qualidade com histórico e regras de imutabilidade para famílias de documentos.
- Comercial com propostas, itens, materiais, importações, composição de custos e funil.
- Planejamento de Obras com marcos, RDO e avanço físico inicial.
- PR #44 já integrado: validação visual de checklist, remoção de ofertas rodoviárias sintéticas da comparação e ajustes de acesso por área em regras selecionadas.

Esses componentes devem ser evoluídos e conectados; não devem ser recriados sem justificativa técnica.

### 2.2 Pontos concretos identificados na leitura da main

Os itens abaixo são evidências para orientar o trabalho, não uma declaração de que toda a área esteja quebrada:

- **OS:** WorkOrdersModule.tsx ainda atualiza o status no cliente e grava o evento de timeline em operação separada. A validação de pré-requisitos precisa ocorrer no backend junto da transição.
- **Inspeções:** InspectionsModule.tsx cria novos registros diretamente com status concluída; o fluxo precisa separar execução, revisão e aprovação.
- **Unidades:** há fallbacks default_unit em fluxos de OS, inspeção, recorrência, ativo e conversão comercial. Registro operacional real deve exigir vínculo válido.
- **RH:** rhPayrollService.ts ainda possui caminho de associação por nome como fallback e defaults substitutos para atributos de campo, como salário, taxa horária, matrícula e data de admissão. A associação deve usar ID estável e dados ausentes precisam permanecer pendentes.
- **Composição de custos:** costCompositionService.ts recorre a localStorage quando a leitura ou gravação no Firestore falha e pode retornar composições de demonstração quando não encontra dados. Esse comportamento precisa ser explícito e não pode simular persistência compartilhada.
- **Modelos de orçamento:** há conteúdo histórico e referências de cliente específicas no motor de composição. Devem ser tratadas como templates/dados históricos identificados, e não como defaults universais ou preços atuais.
- **Recorrências:** a geração de OS é manual e não fecha o ciclo de avanço de nextRunDate, execução agendada e idempotência.
- **Permissões:** src/permissions/areas.ts identifica áreas com enforcement incompleto no banco. A matriz declarada na interface, API, Firestore e Storage precisa ser reconciliada por recurso e finalidade.
- **Operações:** o legado ainda é carregado por iframe em public/operacoes/index.html; a migração deve ser gradual.
- **Servidor:** server.ts continua concentrando aproximadamente 12,6 mil linhas, apesar de já existirem routers extraídos. Persistência em arquivos sincronizados com Storage e tarefas em memória também precisam de evolução para ambientes com múltiplas instâncias.

### 2.3 Regra para esta revisão

O diagnóstico anterior de 20/11 é histórico. Quando suas observações divergirem do código atual, vale a implementação da main pós-PR #44. Não reabrir como pendência algo que já foi comprovadamente implementado; testar regressões e fechar o que ainda falta.

## 3. Modelo de integração recomendado

### 3.1 Projeto/Obra como entidade de ligação

Criar ou consolidar uma entidade mestre de Projeto/Obra, reaproveitando contratos, unidades, centros de custo e vínculos existentes. Não criar um segundo cadastro de contrato paralelo.

A entidade operacional deve conter, conforme aplicável:

- orgId, identificador permanente e código legível;
- cliente, contrato, unidade/planta e centro de custo;
- proposta e versão aprovada que originaram o projeto;
- escopo, disciplinas e orçamento-base aprovado;
- responsáveis, datas, cronograma e marcos;
- estado do projeto e regras do cliente/planta;
- referências a OS, RDO, pessoas, compras, estoque, segurança, qualidade, medições e financeiro.

**Separação conceitual:** contrato representa o compromisso comercial/jurídico; Projeto/Obra representa a execução e seu resultado. Um contrato pode ter um ou mais projetos, conforme a realidade do escopo.

Adicionar projectId gradualmente às entidades operacionais relevantes, preservando contractId, unitId e costCenterId quando continuarem tendo significado próprio.

### 3.2 Cadastros mestres

**Pessoas:** eleger rh_employees como fonte mestre da identidade do colaborador, após saneamento e migração. rh_directory e field_workers podem continuar como projeções operacionais com subconjuntos de dados, ligados por ID estável. collective_asset_workers deve deixar de representar pessoas independentes.

**Materiais:** definir items como catálogo operacional/estoque. commercial_materials pode permanecer temporariamente como projeção comercial, mas deve apontar para o item mestre quando houver correspondência. Não forçar equivalência de itens sem revisão humana.

**Organização:** padronizar orgId como referência preferencial em novos registros e manter compatibilidade legada por migração explícita, sem substituir identificadores silenciosamente.

### 3.3 Eventos e custo realizado

Cada origem operacional deve gerar um fato rastreável, com origem, valor, unidade, data, autor e vínculo:

- apontamento aprovado de horas;
- consumo, devolução, perda ou transferência de material;
- recebimento e custo de compra;
- utilização/locação de equipamento;
- despesa de campo e serviço de terceiro;
- medição, faturamento e recebimento.

O custo por obra deve ser calculado a partir desses fatos de origem. Não duplicar manualmente uma mesma despesa em módulos diferentes. Para reprocessamento, usar chave idempotente por origem e preservar o histórico.

Separar sempre:
- **previsto:** orçamento e planejamento;
- **comprometido:** pedidos, contratos e reservas aprovadas;
- **realizado:** eventos efetivamente registrados e validados.

Correções financeiras/operacionais devem gerar estorno ou evento corretivo rastreável, não apagar silenciosamente o histórico.

## 4. Recomendações por módulo

A ordem abaixo acompanha os 24 módulos principais da aplicação. Alguns recursos aparecem dentro de componentes/subáreas existentes, como Composição de Custos no Comercial e SMS dentro de Construção/Obras.

### 4.1 Painel / Dashboard

**Manter:** visão geral, filtros, indicadores e Central de Pendências.

**Evoluir:**
- indicadores alimentados por fontes transacionais reais;
- status derivados da configuração da empresa, sem listas divergentes;
- filtros por Projeto/Obra, contrato, unidade, OS e centro de custo;
- distinção entre previsto, comprometido e realizado;
- data da última atualização e cobertura dos dados em cada indicador;
- painéis por perfil: diretoria, gerente, supervisor e encarregado;
- alertas acionáveis com navegação para o registro de origem.

**Critério:** nenhum KPI deve somar estimativas como se fossem custos realizados ou misturar dados de demonstração com produção.

### 4.2 Ordens de Serviço e Execução

**Manter:** kanban, timeline, planejamento, responsáveis, diálogo, evidências e histórico.

**Evoluir:**
- máquina de estados validada no backend;
- matriz de transições por perfil, tipo de serviço e política do cliente;
- pré-condições de liberação: equipe, qualificações, APR/PT quando aplicável, materiais e recursos;
- transição e evento de auditoria na mesma transação;
- idempotência contra duplo clique/reenvio;
- apontamento de HH por profissional e atividade;
- horas produtivas, improdutivas e justificativas;
- materiais reservados, consumidos, devolvidos e perdas;
- fotos reais com metadados e armazenamento privado;
- assinaturas/evidências com identidade, horário e integridade;
- impedimentos, retrabalho, reabertura controlada e aceite do cliente;
- numeração sequencial por empresa sem colisão.

**Critério:** nenhuma OS pode ser concluída ou encerrada apenas alterando um campo no navegador. O servidor valida todas as condições e registra a transição atomicamente.

### 4.3 Aprovações LPU

**Evoluir:**
- LPU versionada por cliente e contrato;
- vigência, reajuste e alçadas;
- itens referenciados ao catálogo;
- OS/Projeto vinculados por identificadores, não texto livre;
- aprovação que efetivamente altera o estado do processo;
- uso da LPU aprovada na medição e faturamento;
- histórico de preços e exceções.

### 4.4 OS Recorrentes

**Evoluir:**
- agendador durável e cálculo automático da próxima ocorrência;
- frequência configurável, pausa, retomada e encerramento;
- criação idempotente de OS por recorrência/período;
- modelos com checklist, equipe, materiais e duração padrão;
- preventiva por ativo, planta e contrato;
- histórico de execução e alertas de vencimento.

**Critério:** duas instâncias do servidor ou uma reexecução não podem produzir duas OS para a mesma ocorrência.

### 4.5 Checklists

**Preservar:** correções entregues no PR #44 e templates existentes.

**Evoluir:**
- validação obrigatória no backend, além da interface;
- respostas iniciais vazias;
- suporte real a foto, assinatura, texto, número, múltipla escolha e sim/não;
- faixa aceitável e criticidade por item;
- observação/evidência por item;
- reprovação e abertura de ocorrência quando houver falha crítica;
- aprovação por responsável quando exigida;
- snapshot/versionamento do template usado na execução;
- vínculo obrigatório à OS, inspeção ou etapa aplicável.

**Critério:** template alterado não modifica execução antiga; conclusão incompleta é rejeitada no servidor.

### 4.6 Inspeções e Qualidade / Comissionamento

**Evoluir o fluxo existente:**
- estados de agendada, em execução, enviada para revisão, devolvida, aprovada e encerrada;
- inspetor, revisor, aprovador e datas auditáveis;
- evidências e critérios de aceitação por tipo;
- vínculo com OS, projeto, ativo, documento de engenharia e checklist;
- não conformidade, correção e verificação de eficácia.

**Diferenciais industriais:**
- mapa/passaporte de juntas soldadas;
- soldador, sinete, EPS/WPS e qualificação vigente;
- ensaios LP/PT, PM/MT, US/UT e RX/RT, com laudos;
- teste hidrostático e pneumático;
- torque, alinhamento e inspeção dimensional;
- identificação e calibração de instrumentos;
- rastreabilidade de corrida, lote, fabricante e certificado de material;
- punch list, comissionamento e aceite;
- data book/dossiê técnico final por obra.

**Critério:** inspeção não nasce concluída; somente perfis autorizados aprovam e encerram registros completos.

### 4.7 Itens e Serviços

**Evoluir:**
- catálogo mestre alinhado ao estoque e ao Comercial;
- código, descrição normalizada, unidade, NCM e atributos técnicos;
- equivalência/substituição técnica com aprovação;
- histórico de preço e fornecedor com fonte e data;
- diferenciação entre preço confirmado, histórico e estimativa;
- importação assistida de documentos com revisão humana;
- trilha de alteração de unidade, descrição e classificação.

### 4.8 Estoque

**Preservar:** serviço transacional, custo médio, bloqueio de saldo negativo e movimentos auditáveis.

**Evoluir:**
- reserva por OS/projeto antes da retirada;
- estoque/almoxarifado por obra;
- transferência com estado em trânsito;
- lote, validade, fabricante, série e corrida;
- certificado de material associado a lote/recebimento;
- baixa/consumo valorizado e vinculado à OS;
- devolução de sobra, perda e sucata;
- inventário rotativo, QR Code e ponto de reposição;
- RC sugerida a partir de necessidade real da OS/BOM;
- snapshot de custo unitário e total por movimento.

**Critério:** toda saída/transferência/consumo deve atualizar saldo e histórico atomicamente, com origem e custo rastreáveis.

### 4.9 Ocorrências

**Evoluir:**
- taxonomia consistente de qualidade, operação, SMS e manutenção;
- vínculo com pessoa, ativo, unidade, projeto e OS;
- causa raiz (5 Porquês/Ishikawa);
- plano de ação 5W2H, responsável e prazo;
- evidência de correção e verificação de eficácia;
- reincidência por causa, disciplina, planta e equipamento;
- conversão em OS corretiva sem perder o vínculo original.

### 4.10 Relatórios

**Evoluir:**
- resultado por Projeto/Obra e por OS;
- previsto × comprometido × realizado;
- custo de HH por função/disciplina;
- consumo, perdas e compras fora do planejamento;
- produtividade, retrabalho e avanço físico;
- curva S e projeção de custo ao término;
- prazo, margem e fluxo de caixa;
- qualidade, não conformidade e incidentes;
- origem, data de atualização e cobertura de cada métrica;
- exportações controladas para análise, diretoria e contabilidade.

Remover ou isolar definitivamente ativos, cenários e indicadores fictícios de relatórios de produção.

### 4.11 Suporte

**Evoluir:**
- chamado com categoria, prioridade, responsável e SLA;
- comentários, anexos, histórico e notificações;
- fila de atendimento e escalonamento;
- base de conhecimento;
- métricas de resolução e reincidência.

O módulo só deve prometer atendimento interno quando houver responsável e fluxo real de tratamento.

### 4.12 Assistente de IA

**Evoluir por níveis:**
1. consulta e explicação de dados autorizados;
2. preparação de ações e rascunhos;
3. execução de ações após confirmação explícita.

Adicionar ferramentas para Projeto/Obra, OS, custo, compras, estoque, qualidade, despesas, medições e financeiro, conforme permissão por área.

Toda ferramenta deve:
- validar usuário, empresa, área e escopo do registro;
- limitar os campos e operações permitidos;
- retornar fonte e horário dos dados;
- exigir confirmação para escrita;
- usar idempotência;
- registrar auditoria;
- informar claramente quando um dado estiver ausente ou indisponível.

### 4.13 Estrutura

**Evoluir:**
- Projeto/Obra mestre e relação com contratos;
- plantas/clientes com requisitos documentais, técnicos e de segurança;
- centros de custo e departamentos;
- cargos, CBO, competências e requisitos de qualificação;
- catálogo de permissões por recurso/ação;
- vigência, responsáveis e histórico dos contratos;
- segregação entre dados pessoais, financeiros e operacionais.

### 4.14 Configurações

**Evoluir:**
- persistência efetiva de todos os parâmetros exibidos;
- parâmetros com vigência, versão e responsável;
- alçadas por valor, margem, área e centro de custo;
- regras por contrato/planta;
- histórico de alterações e rollback controlado;
- matriz única de autorização aplicada em interface, API, Firestore e Storage;
- testes automatizados para permissões positivas e negativas.

### 4.15 Construção / Obras / RDO / SMS

**Planejamento e RDO:**
- cronograma com predecessoras, marcos e baseline;
- planejamento semanal de equipe e equipamentos;
- produção planejada versus realizada;
- horas por pessoa, disciplina e atividade;
- horas improdutivas, paralisações e impedimentos;
- avanço físico por escopo;
- evidências por atividade;
- medição e aprovação com histórico de revisão;
- operação offline para apontamentos de campo, com sincronização segura.

**Segurança e SMS — evoluir o que já existe:**
- ASO por tipo e validade, com acesso médico restrito;
- matriz de treinamentos por cargo, atividade e planta;
- integração de segurança por cliente/planta;
- bloqueio de alocação quando documento obrigatório estiver ausente/vencido;
- ficha digital de EPI, CA e validade;
- entrega/devolução/substituição de EPI integrada ao saldo físico;
- histórico de DDS e participação;
- inspeção de equipamentos de segurança;
- indicadores de incidentes e ações corretivas.

Não criar certificação, treinamento, ASO ou aptidão automaticamente. Requisitos e evidências devem vir de registros validados.

### 4.16 Patrimônio / Bens Coletivos

**Evoluir:**
- aplicar bloqueio por calibração/manutenção no backend e nas transações;
- QR Code por ativo e ferramenta;
- checkout/devolução vinculado à pessoa mestre e à obra;
- histórico de localização e responsável;
- manutenção preventiva e corretiva;
- certificados anexados em Storage privado;
- custo por diária/período e apropriação à OS;
- indisponibilidade automática quando houver manutenção ou calibração vencida.

### 4.17 RH / Salários

**Direção:** não transformar o AgueroFlow em folha de pagamento completa. O escopo prioritário é administrar pessoas de campo e gerar variáveis confiáveis para a contabilidade/sistema de folha.

**Evoluir:**
- identidade mestre por ID estável;
- admissão digital persistida no servidor/Firestore e documentos em Storage;
- pendência, devolução, aprovação e trilha de admissão;
- cargo, CBO, departamento e competências;
- certificados, NRs, ASO e documentos por vigência;
- histórico de alocação, disponibilidade, férias e afastamentos;
- apontamentos e exportação de variáveis de folha;
- custo real por colaborador, atividade, OS e obra;
- informações salariais e bancárias sob autorização restrita.

Não usar salário, matrícula, taxa horária, data de admissão ou qualificação fictícios como fallback. Regras legais e tabelas devem ser parametrizadas por vigência e validadas pela contabilidade.

### 4.18 Comercial

**Evoluir:**
- funil com etapas, probabilidade, motivo de perda e histórico;
- revisão de proposta com comparação;
- aprovação interna por margem/alçada;
- registro de envio, visualização, aceite e rejeição;
- assinatura eletrônica por integração;
- conversão ganha para Contrato + Projeto/Obra;
- congelamento da proposta e composição aprovadas;
- histórico de escopo, preço, prazo e margem;
- portfólio técnico ligado a obras concluídas e liberadas para divulgação.

A conversão deve exigir unidade, cliente e vínculos válidos. Não aceitar default_unit ou identificadores substitutos.

### 4.19 Compras e Suprimentos

**Preservar:** RC, cotações, OC, recebimento físico, vínculo com estoque e conciliação com NF-e.

**Evoluir:**
- RC automática/manual ligada à OS, BOM, projeto e centro de custo;
- alçadas reais por valor, categoria e centro de custo;
- qualificação documental de fornecedores;
- desempenho de prazo e qualidade;
- homologação técnica e substituição controlada;
- contratos e pedidos recorrentes;
- previsão de compras a partir do cronograma e reservas;
- alertas de atraso e divergência;
- rastreabilidade de lote/certificado no recebimento.

### 4.20 Financeiro

**Preservar:** contas a pagar/receber, autorização, liquidação, pagamentos parciais, conciliação bancária e NF-e.

**Evoluir:**
- apropriação de custos e receitas por Projeto/Obra/OS;
- compromissos derivados de compras e contratos;
- custos realizados a partir dos eventos operacionais;
- medição, faturamento, retenções e recebimentos conforme parametrização contábil;
- provisões e fluxo de caixa projetado;
- orçamento versus realizado;
- margem por contrato, projeto e cliente;
- conciliação com compras, recebimentos e despesas;
- exportação auditável para Protheus/contabilidade.

O AgueroFlow permanece como plataforma operacional/gerencial e integração, não como substituto do sistema fiscal/contábil.

### 4.21 Viagens e Despesas de Campo

**Direção:** priorizar o controle financeiro e operacional das despesas, não desenvolver um agregador de tarifas sem inventário real.

Consolidar viagem, missão, hospedagem, alimentação, adiantamentos, diárias, reembolsos, comprovantes/OCR e notas de débito em uma Central de Despesas de Campo.

Cada lançamento deve apontar, quando aplicável, para:
- colaborador e aprovador;
- missão e período;
- OS, Projeto/Obra, contrato e centro de custo;
- comprovante, origem e data;
- política aplicável e alçada;
- prestação de contas e estado de aprovação.

Detectar comprovantes duplicados. Distinguir oferta real, link externo e estimativa em qualquer integração de viagem.

### 4.22 Operações legado

**Direção:** migração gradual, sem reescrita integral.

- inventariar telas e funções mais utilizadas;
- medir dependências da ponte atual;
- migrar uma função por vez para React nativo;
- criar testes de equivalência e reconciliação de dados;
- manter compatibilidade durante a transição;
- desligar cada parte antiga somente após validação e plano de rollback.

### 4.23 Marketing / Portfólio Técnico

**Direção:** priorizar acervo técnico B2B industrial.

- cases e obras concluídas;
- escopo por disciplina;
- fotos e vídeos autorizados;
- atestados e documentos de capacidade técnica;
- certificações e qualificações;
- segmentos atendidos;
- book técnico e apresentação comercial gerados a partir de conteúdo aprovado.

Separar materiais internos de conteúdo liberado pelo cliente. Não publicar documentos ou imagens sem autorização registrada.

### 4.24 WhatsApp / Automação

**Evoluir:**
- contexto por usuário e empresa;
- vínculo de identidade entre telefone e usuário;
- consultas com ferramentas autorizadas;
- ações assistidas com confirmação explícita;
- rotinas configuráveis por destinatário, horário e escopo;
- alertas de OS, compras, materiais, segurança, despesas e financeiro;
- histórico de envio, falha, reprocessamento e opt-out;
- fila durável, retentativas, backoff e dead-letter;
- avaliar API oficial/BSP por custo, limites e continuidade.

Rotinas não podem depender exclusivamente de timers de uma instância ou disparar duplicadas quando houver escala horizontal.

## 5. Melhorias estruturais transversais

### 5.1 Segurança por recurso e ação

Construir uma matriz única que responda, em cada recurso:
- quem pode consultar, criar, editar, aprovar, excluir e exportar;
- qual empresa, projeto, unidade ou registro pode acessar;
- se o documento possui informação pessoal, médica, salarial ou financeira;
- qual regra vale no frontend, API, Firestore e Storage.

enforcedInDatabase e outras sinalizações de enforcement devem refletir exatamente a proteção real. Ocultar menu não é controle de segurança.

### 5.2 Persistência e tarefas duráveis

- migrar dados operacionais críticos de arquivos JSON para persistência compartilhada;
- usar Storage privado para anexos e documentos, com metadados e vínculo no banco;
- manter arquivos locais apenas para cache/compatibilidade claramente definida;
- substituir sincronização concorrente de arquivo por escrita transacional onde aplicável;
- adotar fila para OCR, importações, notificações, exportações e tarefas longas;
- mover locks e rate limits compartilhados para mecanismo distribuído quando a aplicação operar em múltiplas instâncias;
- documentar backup, retenção e restauração testada.

### 5.3 Modularização do servidor

Extrair gradualmente routers e serviços de server.ts por domínio:
- OS e execução;
- Comercial e contratos;
- Compras e estoque;
- RH e admissões;
- Construção, RDO e SMS;
- Qualidade e Engenharia;
- Viagens e despesas;
- Financeiro;
- WhatsApp/IA;
- relatórios.

Preservar URLs, contratos, autenticação, permissões e comportamento existentes durante cada extração.

### 5.4 Contratos de dados e observabilidade

- padronizar IDs, timestamps, orgId, relações e estados;
- documentar coleções e donos de dados;
- validar payloads no backend;
- registrar logs estruturados com correlation ID;
- métricas de falha, latência, retentativa e volume;
- auditoria para ações sensíveis;
- tratamento de erros visível ao usuário, sem sucesso silencioso;
- política explícita para dados de demonstração.

### 5.5 Campo e conectividade

- PWA e operação offline para OS, checklist, RDO e evidências;
- fila local de alterações com identificador idempotente;
- resolução explícita de conflito na sincronização;
- indicação do que está pendente de sincronizar;
- armazenamento temporário protegido no dispositivo;
- nunca marcar como concluído algo que ainda não foi sincronizado/confirmado pelo servidor quando a regra exigir confirmação central.

## 6. Roadmap executivo recomendado

### Fase 0 — Confiabilidade e integridade (P0)

1. máquina de estados de OS no backend e timeline atômica;
2. transições e pré-condições por tipo de serviço/cliente;
3. inspeções com fluxo de execução/revisão/aprovação;
4. validação de checklist no backend e versionamento;
5. auditoria de API, Firestore e Storage por recurso;
6. remover fallbacks default_unit e defaults fictícios dos fluxos operacionais;
7. corrigir fallback de composição de custos para que falha de Firestore seja explícita, sem seed automático mascarado;
8. revisar anexos, assinaturas, limites e dados sensíveis.

**Saída da fase:** nenhum fluxo crítico pode ser declarado concluído sem validação no backend, autorização e evidências exigidas.

### Fase 1 — Fundação de dados e Projeto/Obra (P0/P1)

1. modelo de Projeto/Obra e suas relações com contrato, unidade e centro de custo;
2. migração e saneamento de vínculos existentes;
3. cadastro mestre de pessoas e projeções por ID estável;
4. catálogo mestre de materiais com ligação entre Comercial e Estoque;
5. padronização gradual de orgId e contratos de dados;
6. matriz final de permissões por recurso.

**Saída da fase:** todos os novos registros relevantes podem apontar para uma identidade consistente de Projeto/Obra, pessoa e material.

### Fase 2 — Ciclo de OS e execução integrada (P1)

1. proposta ganha gera contrato/projeto e baseline;
2. projeto gera cronograma, OS e necessidades de recursos;
3. equipe e recursos são validados por RH/SMS;
4. reserva de estoque e geração de RC;
5. execução com HH, materiais, equipamentos, RDO e evidências;
6. inspeção, não conformidade e aceite.

**Saída da fase:** o ciclo operacional é rastreável sem redigitar a mesma informação.

### Fase 3 — Custo realizado e resultado por obra (P1)

1. apropriação de HH aprovado;
2. apropriação de material consumido/devolvido;
3. custo de equipamentos, terceiros e despesas de campo;
4. compromissos de compras e contratos;
5. medição, receita, faturamento e recebimento;
6. previsto × comprometido × realizado;
7. margem atual e projeção ao término.

**Saída da fase:** o painel responde quanto a obra deveria custar, quanto comprometeu, quanto gastou e qual sua margem, com origem rastreável.

### Fase 4 — Diferenciais industriais (P2)

1. mapa de juntas e passaporte de soldagem;
2. EPS/WPS, soldadores e qualificações;
3. END, testes e calibração;
4. certificados de materiais e rastreabilidade;
5. punch list, comissionamento e data book.

**Saída da fase:** dossiê técnico industrial estruturado por Projeto/Obra.

### Fase 5 — Inteligência, automação e expansão (P2)

1. ferramentas de IA sobre os dados integrados;
2. ações assistidas com autorização e confirmação;
3. rotinas duráveis e notificações;
4. PWA/offline e migração gradual do legado;
5. portfólio técnico;
6. suporte/SLA e observabilidade operacional.

**Saída da fase:** automações atuam sobre dados confiáveis e processos maduros, sem inventar informações ou contornar controles.

## 7. Jornada ponta a ponta obrigatória de teste

Criar uma suíte E2E que simule, em ambiente isolado, o seguinte fluxo:

1. cadastrar cliente e oportunidade;
2. criar proposta e composição de custos;
3. aprovar uma revisão e registrar a proposta ganha;
4. gerar contrato e Projeto/Obra com unidade válida;
5. congelar orçamento-base;
6. criar cronograma e OS;
7. planejar equipe, materiais e equipamentos;
8. bloquear colaborador sem qualificação exigida;
9. liberar Segurança/APR/PT quando aplicável;
10. reservar material e gerar RC de saldo insuficiente;
11. aprovar cotação/OC e registrar recebimento parcial;
12. conciliar OC, NF-e e recebimento;
13. consumir/devolver material na OS com custo rastreável;
14. registrar HH, RDO e impedimentos;
15. executar checklist e inspeções;
16. abrir e encerrar não conformidade com verificação;
17. validar medição/aceite;
18. apropriar despesas, custos, receita e recebimentos;
19. conferir resultado por OS e Projeto/Obra;
20. testar acesso cruzado entre empresas e áreas, inclusive arquivos.

Cobrir sucesso, falha, repetição de requisição, concorrência e tentativa sem permissão.

## 8. Critérios de engenharia para cada PR futuro

Cada etapa deve:

- partir da main atualizada;
- inspecionar coleções, tipos, serviços e componentes existentes antes de criar estrutura;
- preservar módulos, rotas, autenticação, multiempresa, permissões e identidade visual;
- ser pequena, reversível e limitada ao domínio da etapa;
- separar migração de dados de mudança de interface;
- ter testes unitários, de regras/emuladores e integração conforme o risco;
- demonstrar autorização positiva e negativa;
- ter critérios de aceite reproduzíveis;
- documentar alterações de esquema e estratégia de compatibilidade;
- apresentar explicitamente o que foi implementado e o que permanece no roadmap;
- não introduzir seeds, dados, preços, usuários, datas, unidades ou coordenadas fictícias em produção;
- nunca afirmar que CI, emuladores ou testes manuais passaram sem resultado verificável.

Merge e deploy permanecem sujeitos à revisão e aprovação do responsável pelo repositório.

## 9. Fora do escopo imediato

- reescrita integral do AgueroFlow ou do servidor;
- criação de módulos paralelos para funções já existentes;
- substituição do Protheus ou do sistema contábil/fiscal;
- folha de pagamento completa;
- agregador de passagens sem inventário real e contrato de integração;
- migração integral do iframe em uma única entrega;
- automações de IA com escrita irrestrita;
- publicação automática de conteúdo de clientes sem autorização.

## 10. Resultado esperado

O AgueroFlow deve deixar de ser apenas um conjunto de módulos e se tornar uma plataforma operacional integrada para uma empresa de montagem e manutenção industrial.

A pergunta central que o sistema deverá responder para qualquer obra é:

**Quanto deveria custar, quanto está comprometido, quanto realmente custou, o que foi executado, quem executou, quais materiais foram aplicados, quais riscos foram controlados, quais inspeções foram aprovadas, quanto foi medido e qual resultado financeiro foi gerado?**

O roadmap prioriza primeiro a integridade dos dados e das transições, depois o cadastro mestre e o ciclo completo de execução, em seguida o custo realizado e, por último, os diferenciais industriais e automações avançadas.

Esse é o caminho recomendado para ampliar o AgueroFlow sem perder confiabilidade nem criar novos silos.
