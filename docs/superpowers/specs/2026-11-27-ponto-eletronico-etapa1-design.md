# Ponto eletrônico próprio (REP-P), etapa 1: design

Data: 2026-11-27 · Status: aguardando aprovação do Gustavo

## Por que

A Aguero Inox paga mensalidade ao RH-ID e usa o produto basicamente para bater ponto, e ele não cobre tudo que a empresa precisa. A ideia é ter o ponto dentro do AgueroFlow, no RH, conversando com o resto: cadastro de pessoas, obras, Diário/RDO, pré-folha. São de 200 a 300 funcionários, que batem ponto em obras, muitas vezes sem internet.

**Sucesso na etapa 1:** o ponto roda **em paralelo com o RH-ID por 1 a 2 meses** e as horas batem. Assim o RH-ID pode ser desligado depois da etapa 3 (registro no INPI e atestado técnico).

## Objetivos

1. O funcionário bate ponto pelo app em qualquer lugar, **com ou sem internet**. Sem internet, a marcação fica guardada no aparelho e sobe sozinha quando conectar.
2. Identificação por **selfie com prova de vida + GPS** (cerca da obra), com marcação **à prova de alteração**.
3. **Comprovante** de cada marcação para o funcionário.
4. **Espelho de ponto** por funcionário e período, e **arquivo AFD** no leiaute oficial.
5. **O ponto manda nas horas** (decisão A): o Diário de Operações vem preenchido com as horas do ponto. O encarregado só confirma ou ajusta a obra.

## Fora da etapa 1 (etapas 2 e 3)

- Banco de horas, regras de hora extra, intervalos e escalas complexas, e AEJ.
- Assinatura eletrônica do espelho pelo funcionário.
- Ajustes e atestados com fluxo de aprovação completo. Na etapa 1, o ajuste é manual pelo RH, com justificativa.
- WhatsApp: lembretes, comprovante, aviso de marcação faltando.
- Registro no INPI e atestado técnico (etapa 3, com jurídico ou contador).

## Antiobjetivos (falhou mesmo que funcione)

- Uma marcação alterada ou apagada sem rastro.
- Duas fontes de horas brigando: o ponto e o Diário digitado à mão para as mesmas horas.
- Um cadastro de pessoas novo, separado do `rh_directory`.
- Um módulo novo no menu. O ponto é uma aba do **RH**.
- Funcionário sem conseguir bater ponto por falta de sinal, ou por não ter celular.
- **Dar trabalho para bater o ponto.** O padrão do RH-ID é: um botão, a câmera abre, reconhece, pronto. O público é peão de obra, então nada de PIN, gesto ou menu no caminho normal. PIN e afins são só o plano B, quando o rosto não é reconhecido.
- Biometria tratada sem aviso, sem alternativa, ou em texto aberto.

## Restrições

- **Portaria MTP 671/2021, Anexo IX (REP-P):**
  - identificação do empregador (CNPJ) e do trabalhador (**CPF**);
  - relógio sincronizado com a Hora Legal Brasileira, com variação de até 30 s;
  - coletor mostra hora, minuto e segundo na marcação;
  - offline como exceção, enviado ao reconectar;
  - **NSR** sequencial por estabelecimento, começando em 1;
  - registro com NSR, CPF, data e hora da marcação (com fuso), data e hora da gravação, identificação do coletor e **hash SHA-256**;
  - armazenamento sem exclusão nem alteração pelo prazo legal;
  - log de ajustes de relógio e de alterações de cadastro;
  - comprovante a cada marcação;
  - AFD por período.
- **LGPD:** biometria é dado sensível. É preciso termo de ciência com a finalidade, os dados do rosto ficam criptografados, e há uma alternativa sem biometria para quem recusar (PIN + foto sem comparação + GPS, marcada como "sem biometria").
- **Stack atual:** React 19 + Vite, servidor Express (`server.ts`) no Cloud Run, Firestore. Deploy pelo AI Studio. O app nativo vem do **mesmo código React via Capacitor**.
- Os funcionários de campo **não têm conta no AgueroFlow**. A identidade no app vem do pareamento do aparelho (abaixo), não do login atual.
- **Pessoas:** `rh_directory` (RhEmployee). **Obras:** `units`. Esse cadastro único já existe e o ponto não o duplica.

## Abordagens consideradas

1. **App no celular de cada funcionário.** É simples, a comparação de rosto é 1:1 e o offline é bom. Depende de cada um ter celular e aceitar o app.
2. **Tablet-totem por obra.** Resolve quem não tem celular e prende a marcação ao local. Tem custo de aparelhos e não serve para quem está disperso ou viajando.
3. **Híbrido, o mesmo app com dois modos (escolhida).** O modo pessoal no celular é o padrão. O modo totem fica num tablet pareado a uma obra. Cobre toda a operação sem saber de antemão quem tem celular.

Também foi decidido:

- **Reconhecimento facial em Node (onnxruntime), não em Python.** O mesmo modelo roda no app e no servidor, sem segundo serviço para hospedar.
- **Registro só de acréscimo com hash encadeado.**

## Como funciona

### Pareamento (substitui o login para quem é de campo)

- **Celular pessoal:** no RH, o responsável abre o funcionário e clica em "Parear aparelho". Aparece um QR de uso único, válido por 10 min. O funcionário escaneia no app, e o aparelho gera um **par de chaves** e manda a chave pública ao servidor, ligada ao funcionário. Um aparelho atende um funcionário, e trocar de aparelho revoga o anterior.
- **Totem:** o mesmo fluxo, mas pareado a **uma obra** por um Gerente ou Admin.
- O PIN de 4 a 6 dígitos é definido no pareamento. Ele é **só plano B**: quando o rosto não é reconhecido, ou para quem recusou a biometria.
- **O canal é o app.** O WhatsApp não bate ponto, porque não funciona offline e não faz rosto nem prova de vida com confiança. Ele fica para lembretes e comprovantes (etapa 2).

### Cadastro do rosto (presencial com o RH, uma vez)

- O app guia um vídeo curto: frente, esquerda, direita, cima e baixo. Checa luz, foco e olhos abertos.
- Sai um **vetor do rosto** (embedding) por pose. Fica guardado criptografado no servidor e no aparelho pareado. As fotos do cadastro não são mantidas.
- O funcionário aceita o **termo de ciência LGPD** no próprio app, e o aceite é registrado. Quem recusar fica no modo sem biometria.

### Marcação

1. O app abre direto no **relógio com segundos** e num botão grande "Bater ponto". Ele mostra qual é a próxima marcação esperada (Entrada, Saída almoço, Volta almoço ou Saída).
2. Tocou, a câmera abre e captura cerca de 1,5 s de vídeo. O app faz:
   - **prova de vida passiva**, sem pedir gesto: piscada natural, movimento e textura da pele contra foto ou tela. Só se ficar em dúvida pede "pisque";
   - o reconhecimento:
     - **no celular pessoal:** compara com o rosto daquele funcionário (1:1);
     - **no totem da obra:** compara com **todos os funcionários daquela obra** (1:N; são poucas dezenas). Ninguém digita nada. Só se não reconhecer aparece a lista com o nome e o PIN;
   - a leitura do GPS.
   O resultado aparece numa tela verde enorme, com nome, hora e "Ponto registrado".
3. O app monta a marcação:
   - CPF;
   - data e hora (com fuso);
   - id do aparelho;
   - GPS e precisão;
   - resultado da comparação (score e versão do modelo);
   - flag online ou offline;
   - "tempo desde a última sincronização de relógio", que é monotônico e não muda se mexerem no relógio do celular.
   O aparelho assina a marcação com a chave dele.
4. **Online:** envia na hora. O servidor confere a assinatura, compara a foto de novo, valida a cerca, grava e devolve o comprovante.
   **Offline:** guarda numa fila local (SQLite ou IndexedDB, criptografada), mostra um comprovante provisório "pendente de envio" e sincroniza sozinho ao reconectar.
5. **Fora da cerca, rosto não confere ou relógio com divergência:** a marcação **é gravada mesmo assim**, porque a portaria proíbe impedir a marcação. Ela vai com um **alerta** para o RH revisar.

### Gravação no servidor (ARP)

- A coleção `ponto_marcacoes` fica só no servidor; a regra do Firestore nega tudo ao navegador, como a da Mar Travel.
- **NSR** por estabelecimento (CNPJ), atribuído numa transação.
- O hash SHA-256 de cada registro inclui o hash do anterior, formando uma corrente. Quebrar a corrente denuncia a alteração.
- Ninguém edita nem apaga. Um ajuste é um **registro novo do tipo ajuste**, com justificativa, autor e referência ao original. O original continua no espelho, riscado.
- Também ficam registrados os ajustes de relógio, as alterações do CNPJ ou dos dados do empregador, e as alterações de CPF ou nome do funcionário.
- A foto de cada marcação fica no Storage, só no servidor, **comprimida** (cerca de 300 px, aproximadamente 20–30 KB) para não encher o armazenamento. O prazo de guarda é uma decisão do jurídico; o padrão é 5 anos. A política fina de retenção fica para depois.

### Comprovante

Na tela e salvo no app, com:

- nome e CNPJ da empresa;
- nome e CPF do funcionário;
- NSR;
- data e hora;
- local, com a obra;
- hash.

O funcionário vê o histórico dos próprios comprovantes no app.

### Espelho e AFD (no RH)

- **Nova aba "Ponto" no RH:**
  - espelho por funcionário e período, com as marcações do dia e os alertas;
  - painel do dia: quem marcou, quem falta, pendências offline e alertas;
  - cadastro de aparelhos e totens.
- **Exportar AFD** por período, no leiaute oficial do MTE para REP-P (tipo 7 e cabeçalhos). Tem teste com o leiaute publicado.

### Ponto alimenta o Diário (decisão A)

- Ao fim do dia ou ao abrir o Diário, as marcações viram **horas sugeridas** por funcionário: hn, h50 e h100, pela jornada configurada (padrão 07–17 com 1 h de almoço). A hora em dia útil além da jornada vira h50, e domingo ou feriado vira h100.
- A obra vem da cerca em que marcou.
- O encarregado só confirma ou troca a obra e a situação.
- Daí segue o caminho que já existe: `diarioSync` → `worker_time_logs` → custo de mão de obra e pré-folha.
- O Diário **não edita as horas do ponto**. Se a jornada estiver errada, o caminho é o ajuste no RH, para manter uma fonte só.

### Estabelecimentos e jornada (configuráveis)

- **Estabelecimentos:** o RH cadastra quantos quiser, cada um com CNPJ, razão social e endereço. O funcionário fica ligado a um deles, normalmente pelo campo "Empresa" (`companyName`) que já existe. Cada estabelecimento tem **sua própria sequência de NSR e seu próprio AFD**.
- **Quem bate ponto é configurado por pessoa.** O cadastro tem o tipo de vínculo (CLT ou PJ) e, separado dele, a chave **"bate ponto" (sim ou não)**. O padrão é *sim* para todos. O vínculo não decide nada sozinho, porque há PJs que batem ponto e exceções em geral.
- **Jornada padrão: 07:00–17:00 com 1 h de almoço, de segunda a sexta (9 h por dia).** É configurável por estabelecimento e por pessoa: horário, dias da semana e duração do almoço.
  - Atenção: 9 h × 5 dias = 45 h por semana. Isso passa 1 h do limite de 44 h da CLT, a menos que haja acordo de compensação. O RH ou o contador precisa confirmar como essa hora é tratada, se compensada ou paga como extra. O sistema segue a regra configurada.
- **4 marcações por dia (padrão):** entrada, saída para o almoço, volta do almoço e saída. O app sugere sozinho qual é a próxima. O RH pode trocar para 2 marcações, com almoço pré-assinalado, por estabelecimento ou por pessoa.
- **Princípio geral:** o que for regra de empresa (jornada, marcações, raio, tolerância, feriados, quem bate ponto) é **configuração, não código**. Cada item tem um padrão por estabelecimento e pode ser sobrescrito por pessoa.

### Dados novos nos cadastros existentes

- `rh_directory`: **`cpf`**, criptografado ou com acesso restrito à área RH, e `pontoPinHash`.
- `units`: **`geo: { lat, lng, raioM }`**, com raio padrão de 300 m e mapa para marcar a obra.
- `rh_directory`: `vinculo` (`CLT` | `PJ`), `batePonto` (padrão `true`), `estabelecimentoId` e uma configuração própria opcional, que sobrescreve a do estabelecimento.
- `ponto_estabelecimentos` (nova, ligada à org): CNPJ, razão social, endereço, jornada, quantidade de marcações, raio padrão, tolerância e feriados.

### Permissões

- **Funcionário (app pareado):** registra o próprio ponto e vê os próprios comprovantes.
- **Área RH:** espelho, AFD, ajustes, pareamento e cadastro do rosto.
- **Gerente e Admin:** parear totem e ver alertas.
- **Encarregado (área Operações):** vê as horas sugeridas no Diário da sua obra.

## Decidido pelo Claude (pode corrigir)

- Celular pareado com o RH por QR, com a chave do aparelho no lugar do login. O PIN é só plano B.
- No totem, o rosto é reconhecido entre os funcionários da obra (1:N) sem digitar nada. O PIN só aparece se não reconhecer.
- Prova de vida passiva, sem pedir gesto. Só pede "pisque" se ficar em dúvida.
- A marcação fora da cerca **grava com alerta**, sem bloquear, porque a portaria proíbe restringir a marcação.
- Raio padrão de 300 m, configurável.
- Domingo e feriado viram h100. A lista de feriados é configurável.
- Guarda padrão de 5 anos, a confirmar com o jurídico, com foto comprimida.
- **Modelos de rosto grátis que liberam uso em empresa:** YuNet (detecção) e SFace (reconhecimento) do OpenCV Zoo, mais o MediaPipe do Google. Custo zero. Os modelos pré-treinados do InsightFace ficam de fora: são liberados só para pesquisa, e usá-los na empresa traria risco jurídico.

## Deixado para quem constrói

- A combinação exata dos modelos e a calibração dos limites (score para aceitar, para alertar e para pedir piscada). Tudo dentro dos modelos citados acima, ou outros grátis que liberem uso em empresa e rodem offline.
- O plugin de câmera, GPS e armazenamento do Capacitor.
- Detalhes visuais. As telas seguem o design system do app, com botões grandes, pensando em quem está de luva e no sol.
- A publicação nas lojas (Play Store e App Store) é um passo próprio. Antes disso, o Android pode ser distribuído por APK.

## Riscos

- iPhone em segundo plano: a sincronização só acontece com o app aberto. O app avisa quando há pendências.
- Celular sem relógio confiável offline: fica mitigado pelo tempo monotônico e pelo alerta de divergência.
- A aceitação dos funcionários depende de comunicação e do termo LGPD. Por isso existe a alternativa sem biometria.
