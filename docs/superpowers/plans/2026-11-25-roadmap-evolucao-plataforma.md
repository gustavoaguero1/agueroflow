# AgueroFlow — Roadmap de evolução da plataforma

**Base analisada:** `main` no commit `86bda70b4870c33a1e46faddd07fbac3b2199ef4`  
**Branch desta entrega:** `feature/platform-hardening-p0`  
**Objetivo:** evoluir o AgueroFlow como plataforma integrada de gestão de contratos, obras, manutenção e serviços industriais, preservando módulos, rotas, autenticação, permissões, multiempresa, auditoria e identidade visual já existentes.

Este documento separa as correções efetivamente incluídas nesta branch das melhorias que ainda exigem implementação por etapas. A existência de um item no roadmap não significa que ele já esteja entregue.

---

## 1. Entregue nesta branch

### P0 — Confiabilidade e controle de acesso

- **Checklists:** respostas começam em branco; itens obrigatórios impedem a conclusão quando não respondidos; progresso é calculado pelas respostas realmente preenchidas; respostas negativas são registradas como não conformidades no histórico.
- **Viagens:** horários, tarifas e itinerários gerados por estimativa de corredor deixam de ser expostos como ofertas reais. Conectores sem inventário retornado pelo provedor ficam como consulta apenas por link, sem preço fictício na comparação.
- **Acesso por área:** coleções de checklists, inspeções e evidências/documentos operacionais passam a respeitar o nível da área Operações nas regras Firestore/Storage.
- **Testes:** testes unitários para validação do checklist e testes de emulador para acesso por área foram acrescentados.

### Limites importantes

- A validação de checklist na interface melhora a experiência e evita conclusão acidental, mas não substitui uma validação de negócio no servidor. A próxima etapa deve mover a finalização para uma função transacional/servidor e validar novamente os dados contra a versão do template.
- O módulo de viagens continua sem inventário real para conectores que não retornam dados do fornecedor. A tela deve orientar o usuário a abrir o site do fornecedor e conferir a disponibilidade antes de decidir; não se deve chamar estimativa de tarifa confirmada.
- As regras de Storage continuam permitindo leitura de evidências a quem tem nível de visualização em Operações. Dados que exigem segregação mais fina (por exemplo, documentos pessoais ou anexos de reembolso) precisam de um desenho de permissões próprio antes de serem classificados como confidenciais.

---

## 2. P0 — Próximas correções obrigatórias

### 2.1 Ordem de Serviço: fluxo transacional de estados

**Situação observada:** a atualização de status da OS é feita no cliente e o evento de histórico é gravado em operação separada. Os pré-requisitos de execução não são verificados no mesmo ponto transacional.

**Implementar:**
- Máquina de estados formal: rascunho, planejada/agendada, liberada, em execução, aguardando material, concluída, em validação e encerrada.
- Transições permitidas por papel e nível de acesso; transições inválidas devem ser rejeitadas no servidor.
- Pré-condições configuráveis por tipo de serviço/cliente: APR/PT liberada quando aplicável, equipe habilitada, checklist obrigatório, materiais/recursos, evidências, apontamento e aceite.
- Captura de GPS quando exigida pela política; falha de geolocalização deve permanecer explícita e nunca ser substituída por coordenada inventada.
- Atualização de status e evento de auditoria na mesma transação.
- Idempotência para evitar eventos duplicados em repetição de requisição.

**Critérios de aceite:** usuário sem permissão não muda estado pela API; transição sem pré-requisito é rejeitada; status e timeline não divergem após falha; tentativa duplicada não cria evento duplicado; testes de unidade e emulador cobrem matriz de transições.

### 2.2 Inspeções: separar registro, execução e aprovação

**Situação observada:** o formulário atual registra resultado e constatações já como inspeção concluída. Antes de ampliar o fluxo, separar claramente o registro inicial da execução técnica e da validação.

**Implementar:**
- Estados: agendada, em campo, enviada para revisão, devolvida para correção, aprovada e encerrada.
- Responsável, revisor, datas e trilha de alterações.
- Associação opcional/obrigatória a OS, ativo, unidade, contrato e checklist conforme o tipo de inspeção.
- Evidências e não conformidades ligadas à ocorrência e ao plano de ação corretiva.
- Bloqueio de aprovação quando faltarem campos ou evidências exigidos pelo modelo.

**Critérios de aceite:** não é possível aprovar uma inspeção incompleta; somente perfis autorizados revisam/aprovam; correção mantém histórico e responsável.

### 2.3 Segurança de API e arquivos

- Inventariar cada rota Express e classificar autenticação, empresa, área, nível de leitura/escrita, papel e dados sensíveis.
- Reutilizar funções de autorização compartilhadas; não depender apenas de ocultar botões no frontend.
- Revisar regras de Storage para cada família de arquivos (OS, operações, RH, EPI, engenharia, qualidade, financeiro), usando permissões específicas por finalidade.
- Não armazenar assinatura como data URL no documento de OS; usar objeto no Storage e metadados imutáveis.
- Aplicar limites de tipo, tamanho, extensão real, nome e vínculo do arquivo ao documento/empresa.
- Cobrir negativas explícitas com testes de emulador, incluindo tentativa de acesso cruzado entre empresas e nível de área insuficiente.

### 2.4 Conversão Comercial → OS

**Situação observada:** a conversão pode preencher unidade com identificador substituto quando não há unidade válida.

- Impedir conversão se unidade/contrato/projeto obrigatório estiver ausente ou não pertencer à empresa.
- Preservar versão aprovada da proposta, escopo, preço, margem, condições e anexos como baseline imutável.
- Criar OS e evento de conversão em operação idempotente; permitir revisão contratual sem sobrescrever a versão que o cliente aprovou.
- Deixar claros os responsáveis por orçamento, aprovação, planejamento e execução.

### 2.5 Relatórios: distinguir estimativa de realizado

- Identificar cada valor como previsto, comprometido ou realizado.
- Não chamar custo estimado da OS de custo real do projeto.
- Ligar compras/recebimentos, consumo de estoque, mão de obra apontada, viagem, hospedagem, reembolsos, equipamentos e terceiros ao contrato/OS/centro de custo.
- Exibir a origem, data de atualização e cobertura de cada indicador.

---

## 3. P1 — Integração do ciclo de obra e operação

### 3.1 Cadastro mestre de projeto/contrato

Criar uma identidade única de projeto/obra que conecte contrato, unidade, cliente, centro de custo, proposta aprovada, escopo, cronograma, OS, equipe, segurança, materiais, qualidade, medições e financeiro. Não criar cadastros paralelos quando uma entidade existente puder ser estendida.

### 3.2 RH e pessoas de campo

- Consolidar `rh_employees` como origem mestre da identidade do colaborador, com projeções operacionais controladas para `field_workers` e `rh_directory`.
- Sincronizar por ID estável, nunca por nome.
- Manter salários, dados bancários, documentos pessoais e informações médicas sob regras próprias; a operação de campo só recebe os atributos estritamente necessários.
- Criar trilha de admissão, treinamento, habilitação, alocação, afastamento e desligamento.
- Atualizar parâmetros tributários/previdenciários por vigência e revisão contábil; não fixar tabela de ano anterior na interface.

### 3.3 Compras e estoque por OS

- Reservar materiais por OS e contrato.
- Separar solicitado, cotado, pedido, em trânsito, recebido, inspecionado, armazenado, reservado e consumido.
- Registrar devolução, perda, transferência, lote, validade, número de série e certificado de material quando aplicável.
- Levar custo médio/real do movimento para a OS de destino.
- Manter o recebimento e a conciliação PO × NF-e × recebimento como base transacional existente.

### 3.4 Despesas de campo

Consolidar viagem, hospedagem, adiantamento, diária, reembolso, notas fiscais e comprovantes em um fluxo único, com vínculo a colaborador, missão, OS, contrato, unidade e centro de custo. Prever aprovação, prestação de contas, duplicidade de comprovante e exportação para o financeiro/Protheus. Não automatizar pagamento.

### 3.5 Planejamento e execução de obras

- Cronograma por etapas, marcos, predecessoras e linha de base aprovada.
- Equipes, recursos, equipamentos e materiais vinculados à atividade.
- RDO diário com mão de obra, equipamentos, atividades, impedimentos, clima e evidências.
- Medição física por etapa/escopo, aprovação e histórico de revisão.
- Alertas de atraso, impedimento, desvio de produtividade e risco de prazo.

### 3.6 Financeiro por projeto

- Orçamento base aprovado, revisões e compromissos.
- Contas a pagar/receber e conciliação por contrato/OS/centro de custo.
- Medições, faturamento e retenções conforme processo definido pela contabilidade.
- Previsto × comprometido × realizado, fluxo de caixa e margem.
- Exportação controlada para Protheus/contabilidade; o AgueroFlow continua como camada de apoio e integração, não substituto fiscal/contábil.

### 3.7 Relatórios e indicadores

- Resultado do projeto e margem por contrato/OS.
- Custo de mão de obra por hora e por atividade.
- Consumo/perda de materiais e compras fora do planejamento.
- Produtividade, avanço físico, curva S e projeção de custo ao término.
- Retrabalho, não conformidade, incidentes, tempo de resposta e reincidência.
- Indicadores sempre rastreáveis a registros de origem.

---

## 4. P2 — Diferenciais industriais e evolução tecnológica

### 4.1 Qualidade industrial e comissionamento

- Mapa de solda e passaporte de juntas.
- EPS/WPS, qualificação e identificação de soldadores.
- Ensaios não destrutivos (LP/PT, PM/MT, US/UT, RX/RT), laudos e rastreabilidade.
- Testes hidrostáticos/pneumáticos, torque, alinhamento e calibração.
- Punch list, as built, certificados de materiais e data book final do cliente.

### 4.2 Migração gradual do Operações legado

- Preservar o bridge Firebase atual e os dados existentes.
- Migrar uma aba por vez para componentes nativos React.
- Criar testes de equivalência antes de desligar cada rota/tela antiga.
- Não reescrever o iframe inteiro em uma única entrega.

### 4.3 IA e WhatsApp

- Fazer cada ferramenta respeitar as permissões de área e empresa do usuário, não apenas o papel geral.
- Começar com leitura e resumo; qualquer ação de escrita exige confirmação humana explícita, idempotência, limite de escopo e auditoria.
- Tornar tarefas agendadas duráveis, rastreáveis e reexecutáveis, com fila, tentativas, backoff e dead-letter.
- Avaliar API oficial/BSP para WhatsApp segundo custo, suporte, limites e continuidade operacional antes de substituir o conector atual.

### 4.4 Arquitetura de servidor e persistência

- Extrair gradualmente rotas de `server.ts` por domínio, mantendo contratos e middlewares existentes.
- Inventariar estado persistido em arquivos locais e migrações para Firestore/Storage/serviço durável.
- Evitar sincronização concorrente last-write-wins entre múltiplas instâncias.
- Mover rate limit compartilhado e locks para mecanismo distribuído quando houver escala horizontal.
- Adotar fila para OCR, conciliação, envio de mensagens, importações e relatórios longos.

### 4.5 Marketing, portfólio e suporte

- Portfólio técnico por obra: escopo, disciplinas, fotos/vídeos autorizados, marcos, atestados e documentos aprovados para publicação.
- Gerar catálogo institucional a partir de cases revisados e liberados pelo cliente.
- Suporte com responsável, SLA, prioridades, histórico, anexos, base de conhecimento e métricas de resolução.
- Separar métricas demonstrativas de dados reais e nunca publicar informação de cliente sem autorização.

### 4.6 Documentação e operação

- Documentar arquitetura, mapa de módulos, serviços e coleções.
- Documentar variáveis de ambiente, setup local, deploy, rollback e recuperação de backup.
- Definir política de retenção, logs, observabilidade, alertas e incidentes.
- Manter testes unitários, de regras Firestore/Storage, integração e jornada ponta a ponta.

---

## 5. Ordem recomendada de execução

1. **P0.1:** concluir validação no servidor e fechar a matriz de transições da OS.
2. **P0.2:** fluxo de revisão de inspeções e não conformidades.
3. **P0.3:** auditoria completa de rotas, Storage, anexos e assinaturas.
4. **P0.4:** conversão comercial com contrato/unidade/escopo válidos.
5. **P1.1:** projeto/obra como elo mestre de dados.
6. **P1.2:** custo realizado e despesas de campo por OS/contrato.
7. **P1.3:** integração RH, equipe, segurança, compras, estoque e medição.
8. **P2:** qualidade industrial, migração do legado, IA/WhatsApp, arquitetura distribuída, portfólio e suporte.

## 6. Regras de implementação para as próximas etapas

- Inspecionar o código e os dados existentes antes de criar estrutura nova.
- Reaproveitar serviços, tipos, coleções, componentes e permissões já existentes.
- Fazer alterações pequenas e reversíveis; não refatorar módulos não relacionados.
- Não introduzir placeholders como unidade, preço, fornecedor, usuário ou coordenada em dados operacionais.
- Não misturar demonstração, estimativa e dado confirmado.
- Adicionar testes para regra de negócio e autorização antes de ampliar a interface.
- Entregar cada fase em branch e PR próprios, com alterações, riscos, testes e critérios de aceite.
- Merge e deploy permanecem sob aprovação do responsável pelo repositório.
