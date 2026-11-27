# Ponto eletrônico, núcleo (plano 1 de 2): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** construir o núcleo do ponto REP-P no AgueroFlow:
- configuração por estabelecimento e por pessoa;
- registro de marcações imutável (NSR, hash SHA-256 encadeado);
- pareamento de aparelho com assinatura;
- API para o app (online e em lote offline);
- espelho, ajustes e AFD no RH;
- horas do ponto alimentando o Diário.

**Architecture:** a lógica pura (jornada, geo, CPF, sugestão para o Diário) fica em `src/ponto/`, importável pelo servidor e, no plano 2, pelo app. O servidor (`server/ponto/*` + `server/pontoRoutes.ts`) grava tudo em coleções só do servidor via Admin SDK, no mesmo padrão de store em memória e store Firestore de `server/travelProviderRoutes.ts`. O app (Capacitor, rosto, offline) é o **plano 2**. Este plano entrega a API que ele consome, testada com aparelhos simulados (chaves ECDSA geradas no teste).

**Tech Stack:** TypeScript, Express, Firestore Admin, WebCrypto (ECDSA P-256), React 19, `node:test` via `tsx --test`.

**Spec:** `docs/superpowers/specs/2026-11-27-ponto-eletronico-etapa1-design.md`

## Global Constraints

- **Padrões da configuração:**
  - jornada 07:00–17:00, almoço de 60 min, dias seg–sex (`[1,2,3,4,5]`);
  - 4 marcações por dia;
  - raio de 300 m;
  - tolerância de 10 min por dia;
  - domingo e feriado = h100;
  - `batePonto` = `true` para todos, independente do vínculo (CLT ou PJ).
- **Configuração em cascata:** tudo que é regra de empresa é configuração. Cada estabelecimento tem um padrão, e a pessoa pode sobrescrever qualquer campo.
- **Nunca bloquear a marcação** por cerca, rosto ou relógio. Grava com `alertas`. Só se recusa assinatura inválida, aparelho desconhecido ou revogado (401) e payload malformado (400).
- Marcação nunca é editada nem apagada. Ajuste é um registro separado em `ponto_ajustes`.
- NSR sequencial por estabelecimento, começando em 1. Hash SHA-256 encadeado com o registro tipo 7 anterior do mesmo estabelecimento.
- **AFD:** leiaute 004, ISO 8859-1, linhas terminadas em CRLF.
  - tipo 1 com 302 chars, tipo 7 com 137 chars, tipo 9 com 64 chars;
  - linha final com `ASSINATURA_DIGITAL_EM_ARQUIVO_P7S` completada com espaços até 100;
  - CRC-16/KERMIT (`"123456789"` → `2189`);
  - coletor `01` (app);
  - offline `1`, online `0`.
- Relógio: diferença acima de 30 s entre o horário da marcação e o esperado gera o alerta `relogio`.
- CPF, PIN e chaves ficam **só no servidor** (`ponto_pessoas`, `ponto_devices`). Nada disso vai para `rh_directory`, porque Operações lê esse cadastro.
- Rotas do RH: `requireArea('rh', 1)` para ler e `requireArea('rh', 2)` para gravar. Pareamento de totem: `requireRole('Admin','Gerente')`.
- Textos de tela em português simples.
- Comandos com mais de 500 caracteres ou mais de 10 separadores são bloqueados pelo hook: use scripts em `/tmp`.
- Testes: `npm test` (todos os `tests/*.test.ts`) e `npm run test:emulator` para as regras.

## Review Focus

1. **Lote offline reenviado** (o app reenvia o mesmo `clientId` porque a resposta se perdeu): deve devolver o mesmo NSR e o mesmo comprovante, sem gravar duplicado. Teste na Task 4.
2. **Duas marcações simultâneas no mesmo estabelecimento**: os NSRs não podem repetir nem pular, e a corrente de hash não pode quebrar. Teste na Task 4 com `Promise.all` de 20 marcações.
3. **Marcação offline de um dia anterior** chegando depois de outras mais novas: grava com NSR novo (ordem de gravação) e entra no espelho no dia da `dataHora`. Teste na Task 7.
4. **Dia incompleto** (só a entrada, ou número ímpar de marcações): o espelho mostra `incompleto`, a sugestão do Diário não inventa horas (fica `incompleto: true`, horas 0) e o painel acusa. Teste nas Tasks 1 e 8.
5. **Pessoa sem CPF ou sem estabelecimento** tentando parear: 400 com mensagem clara, nunca um aparelho pareado que depois não consegue gravar. Teste na Task 5.

---

### Task 1: Configuração e cálculo de jornada (puro)

**Files:**
- Create: `src/ponto/config.ts`, `src/ponto/jornada.ts`
- Test: `tests/pontoJornada.test.ts`

**Interfaces:**
- Produces:
  - `type TipoMarcacao = 'entrada' | 'saida_almoco' | 'volta_almoco' | 'saida'`
  - `interface PontoConfig { inicio: string /*"07:00"*/; fim: string /*"17:00"*/; almocoMin: number; dias: number[] /*0=dom*/; marcacoesPorDia: 2 | 4; raioM: number; toleranciaMin: number; feriados: string[] /*YYYY-MM-DD*/; batePonto: boolean }`
  - `const PONTO_DEFAULTS: PontoConfig`
  - `resolveConfig(estab?: Partial<PontoConfig>, pessoa?: Partial<PontoConfig>): PontoConfig` (pessoa > estab > defaults)
  - `proximaMarcacao(tiposDoDia: TipoMarcacao[], cfg: PontoConfig): TipoMarcacao`
  - `horasDoDia(marcacoes: { tipo: TipoMarcacao; dataHora: string }[], dataISO: string, cfg: PontoConfig): { hn: number; h50: number; h100: number; trabalhadoMin: number; incompleto: boolean }`

- [ ] **Step 1: Write the failing tests**

```ts
test('defaults da empresa', () => {
  assert.deepEqual(resolveConfig(), { inicio: '07:00', fim: '17:00', almocoMin: 60, dias: [1,2,3,4,5], marcacoesPorDia: 4, raioM: 300, toleranciaMin: 10, feriados: [], batePonto: true });
});
test('pessoa sobrescreve estabelecimento, que sobrescreve padrão', () => {
  const c = resolveConfig({ raioM: 500, marcacoesPorDia: 2 }, { raioM: 100 });
  assert.equal(c.raioM, 100); assert.equal(c.marcacoesPorDia, 2); assert.equal(c.inicio, '07:00');
});
test('próxima marcação no modo 4 e no modo 2', () => {
  const c4 = resolveConfig();
  assert.equal(proximaMarcacao([], c4), 'entrada');
  assert.equal(proximaMarcacao(['entrada'], c4), 'saida_almoco');
  assert.equal(proximaMarcacao(['entrada','saida_almoco'], c4), 'volta_almoco');
  assert.equal(proximaMarcacao(['entrada','saida_almoco','volta_almoco'], c4), 'saida');
  assert.equal(proximaMarcacao(['entrada','saida_almoco','volta_almoco','saida'], c4), 'entrada'); // volta após sair
  assert.equal(proximaMarcacao(['entrada'], resolveConfig({ marcacoesPorDia: 2 })), 'saida');
});
const m = (tipo: any, hh: string) => ({ tipo, dataHora: `2026-11-25T${hh}:00-03:00` }); // quarta
test('dia normal 07–12, 13–17 = 9h normais', () => {
  assert.deepEqual(horasDoDia([m('entrada','07:00'), m('saida_almoco','12:00'), m('volta_almoco','13:00'), m('saida','17:00')], '2026-11-25', resolveConfig()),
    { hn: 9, h50: 0, h100: 0, trabalhadoMin: 540, incompleto: false });
});
test('extra dentro da tolerância de 10 min não conta; acima vira h50', () => {
  const base = [m('entrada','07:00'), m('saida_almoco','12:00'), m('volta_almoco','13:00')];
  assert.equal(horasDoDia([...base, m('saida','17:08')], '2026-11-25', resolveConfig()).h50, 0);
  assert.equal(horasDoDia([...base, m('saida','18:30')], '2026-11-25', resolveConfig()).h50, 1.5);
});
test('domingo e feriado: tudo h100; sábado (fora dos dias): tudo h50', () => {
  const dia = (d: string) => [{ tipo: 'entrada', dataHora: `${d}T07:00:00-03:00` }, { tipo: 'saida', dataHora: `${d}T11:00:00-03:00` }] as any;
  assert.equal(horasDoDia(dia('2026-11-29'), '2026-11-29', resolveConfig({ marcacoesPorDia: 2 })).h100, 4);
  assert.equal(horasDoDia(dia('2026-11-25'), '2026-11-25', resolveConfig({ marcacoesPorDia: 2, feriados: ['2026-11-25'] })).h100, 4);
  assert.equal(horasDoDia(dia('2026-11-28'), '2026-11-28', resolveConfig({ marcacoesPorDia: 2 })).h50, 4);
});
test('modo 2: desconta o almoço pré-assinalado', () => {
  const r = horasDoDia([m('entrada','07:00'), m('saida','17:00')], '2026-11-25', resolveConfig({ marcacoesPorDia: 2 }));
  assert.equal(r.hn, 9); assert.equal(r.trabalhadoMin, 540);
});
test('dia incompleto não inventa horas', () => {
  assert.deepEqual(horasDoDia([m('entrada','07:00')], '2026-11-25', resolveConfig()), { hn: 0, h50: 0, h100: 0, trabalhadoMin: 0, incompleto: true });
});
```

- [ ] **Step 2:** `npx tsx --test tests/pontoJornada.test.ts` → FAIL (módulo inexistente).
- [ ] **Step 3: Implement** in `src/ponto/config.ts` and `src/ponto/jornada.ts`.
  - Ordene as marcações por `dataHora` e some os pares (entrada→saida_almoco, volta_almoco→saida; no modo 2, entrada→saida menos `almocoMin`).
  - Número ímpar de marcações = `incompleto`.
  - Jornada do dia = (fim − inicio) − almocoMin.
  - Excesso ≤ `toleranciaMin` = 0.
  - Horas arredondadas a 2 casas.
  - O dia da semana vem da data (`dataISO`), em UTC-3.
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5:** commit `feat(ponto): configuração em cascata e cálculo de jornada`.

### Task 2: Geo e CPF (puro)

**Files:**
- Create: `src/ponto/geo.ts`, `src/ponto/cpf.ts`
- Test: `tests/pontoGeoCpf.test.ts`

**Interfaces:**
- Produces:
  - `distanciaM(a: {lat:number;lng:number}, b: {lat:number;lng:number}): number` (haversine, R=6371000)
  - `obraMaisProxima(pos: {lat:number;lng:number} | null, obras: {id:string;nome:string;geo?:{lat:number;lng:number;raioM?:number}|null}[], raioPadraoM: number): { unitId: string; nome: string; distM: number; dentro: boolean } | null`
  - `isValidCpf(s: string): boolean`
  - `onlyDigitsCpf(s: string): string` (11 dígitos)

- [ ] **Step 1: tests**

```ts
test('distância Praça da Sé → MASP ≈ 2,6 km', () => {
  const d = distanciaM({ lat: -23.5505, lng: -46.6333 }, { lat: -23.5614, lng: -46.6559 });
  assert.ok(d > 2400 && d < 2800);
});
test('obra mais próxima; dentro do raio da obra ou do padrão; sem GPS = null', () => {
  const obras = [{ id: 'u1', nome: 'A', geo: { lat: -23.5505, lng: -46.6333 } }, { id: 'u2', nome: 'B', geo: { lat: -23.5614, lng: -46.6559, raioM: 50 } }, { id: 'u3', nome: 'sem geo', geo: null }];
  assert.equal(obraMaisProxima({ lat: -23.5506, lng: -46.6334 }, obras, 300)?.unitId, 'u1');
  assert.equal(obraMaisProxima({ lat: -23.5506, lng: -46.6334 }, obras, 300)?.dentro, true);
  assert.equal(obraMaisProxima({ lat: -23.5620, lng: -46.6559 }, obras, 300)?.dentro, false); // ~67 m de B, raio 50
  assert.equal(obraMaisProxima(null, obras, 300), null);
});
test('CPF', () => {
  assert.equal(isValidCpf('529.982.247-25'), true);
  assert.equal(isValidCpf('111.111.111-11'), false);
  assert.equal(isValidCpf('529.982.247-24'), false);
  assert.equal(onlyDigitsCpf('529.982.247-25'), '52998224725');
});
```

- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run → PASS. **Step 5:** commit `feat(ponto): distância até a obra e validação de CPF`.

### Task 3: Gerador de AFD

**Files:**
- Create: `server/ponto/afd.ts`
- Test: `tests/pontoAfd.test.ts`

**Interfaces:**
- Produces:
  - `crc16Kermit(s: string): string` (4 hex maiúsculos)
  - `dhAfd(iso: string): string` → `AAAA-MM-DDThh:mm:00-0300`, no fuso do próprio ISO
  - `camposTipo7(r: { nsr: number; dataHora: string; cpf: string; gravadoEm: string; coletor: '01'; offline: boolean }): string` (73 chars, posições 1–73)
  - `hashTipo7(campos: string, prevHash: string | null): string` (sha256 hex minúsculo de `campos + (prevHash ?? '')`)
  - `linhaTipo7(campos: string, hash: string): string` (137)
  - `linhaTipo2(r: { nsr: number; gravadoEm: string; cpfResp: string; cnpj: string; razaoSocial: string; local: string }): string` (331 chars, CRC sobre as posições 1–327)
  - `linhaTipo5(r: { nsr: number; gravadoEm: string; operacao: 'I' | 'A' | 'E'; cpf: string; nome: string; cpfResp: string }): string` (118 chars, CRC sobre as posições 1–114)
  - `gerarAfd(p: { cnpj: string; razaoSocial: string; inpi: string; inicio: string; fim: string; geradoEm: string; desenvolvedorCnpj: string; linhas: { nsr: number; tipo: 2 | 5 | 7; linha: string }[] }): string`. As linhas saem ordenadas por NSR, e o trailer conta os tipos 2, 5 e 7.

- [ ] **Step 1: tests**

```ts
test('CRC-16/KERMIT de referência', () => assert.equal(crc16Kermit('123456789'), '2189'));
test('data-hora no formato do AFD', () => assert.equal(dhAfd('2026-11-25T07:00:41-03:00'), '2026-11-25T07:00:00-0300'));
test('tipo 7: tamanho, posições e hash encadeado', () => {
  const c1 = camposTipo7({ nsr: 1, dataHora: '2026-11-25T07:00:00-03:00', cpf: '52998224725', gravadoEm: '2026-11-25T07:00:05-03:00', coletor: '01', offline: false });
  assert.equal(c1.length, 73);
  assert.equal(c1.slice(0, 9), '000000001'); assert.equal(c1[9], '7');
  assert.equal(c1.slice(34, 46), '052998224725'); assert.equal(c1.slice(70, 72), '01'); assert.equal(c1[72], '0');
  const h1 = hashTipo7(c1, null); assert.match(h1, /^[0-9a-f]{64}$/);
  const c2 = camposTipo7({ nsr: 2, dataHora: '2026-11-25T12:00:00-03:00', cpf: '52998224725', gravadoEm: '2026-11-25T12:00:01-03:00', coletor: '01', offline: true });
  assert.notEqual(hashTipo7(c2, h1), hashTipo7(c2, null));
  assert.equal(linhaTipo7(c1, h1).length, 137);
});
test('arquivo: cabeçalho 302, trailer 64, assinatura 100, CRLF, contagem do tipo 7', () => {
  const c = camposTipo7({ nsr: 1, dataHora: '2026-11-25T07:00:00-03:00', cpf: '52998224725', gravadoEm: '2026-11-25T07:00:05-03:00', coletor: '01', offline: false });
  const txt = gerarAfd({ cnpj: '11222333000181', razaoSocial: 'AGUERO INOX LTDA', inpi: '', inicio: '2026-11-01', fim: '2026-11-30', geradoEm: '2026-11-30T18:00:00-03:00', desenvolvedorCnpj: '11222333000181', linhas: [{ nsr: 1, tipo: 7, linha: linhaTipo7(c, hashTipo7(c, null)) }] });
  const linhas = txt.split('\r\n'); assert.equal(linhas.at(-1), '');
  assert.equal(linhas[0].length, 302); assert.equal(linhas[0].slice(9, 10), '1'); assert.equal(linhas[0].slice(250, 253), '004');
  assert.equal(linhas[0].slice(298), crc16Kermit(linhas[0].slice(0, 298)));
  assert.equal(linhas[1].length, 137);
  assert.equal(linhas[2].length, 64); assert.equal(linhas[2].slice(0, 9), '999999999'); assert.equal(linhas[2].slice(54, 63), '000000001');
  assert.equal(linhas[3], 'ASSINATURA_DIGITAL_EM_ARQUIVO_P7S'.padEnd(100, ' '));
});
test('tipos 2 e 5: tamanho e CRC; trailer conta cada tipo', () => {
  const l5 = linhaTipo5({ nsr: 1, gravadoEm: '2026-11-25T06:00:00-03:00', operacao: 'I', cpf: '52998224725', nome: 'José Ação', cpfResp: '52998224725' });
  assert.equal(l5.length, 118); assert.equal(l5[9], '5'); assert.equal(l5.slice(114), crc16Kermit(l5.slice(0, 114)));
  assert.match(l5, /JOSE ACAO|Jose Acao/);
  const l2 = linhaTipo2({ nsr: 2, gravadoEm: '2026-11-25T06:00:00-03:00', cpfResp: '52998224725', cnpj: '11222333000181', razaoSocial: 'AGUERO', local: 'Obra' });
  assert.equal(l2.length, 331); assert.equal(l2[9], '2');
});
```

- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement.**
  - Numérico: zeros à esquerda. Alfa: espaços à direita, sem acentos (normalize NFD e remova as marcas). Corte no tamanho.
  - Tipo 1, campos na ordem do leiaute:
    - campo 3 = `1` (CNPJ);
    - campo 5 = 14 zeros;
    - campo 7 = `inpi` com 17 chars (zeros se vazio);
    - campo 11 = `004`;
    - campo 12 = `1`;
    - campo 14 = 30 espaços;
    - CRC sobre as posições 1–298.
  - Trailer: zeros para os tipos 2 a 6 e a contagem do tipo 7.
  - Saída em `latin1` é responsabilidade da rota (Task 7).
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5:** commit `feat(ponto): gerador do arquivo AFD (leiaute 004, REP-P)`.

**Ruling a registrar no ledger:** o leiaute não fixa separador nem caixa do hash, nem a cobertura exata do CRC. Escolhido: concatenação dos campos 1–7 exatamente como no registro, mais o hash anterior, sem separador, hex minúsculo; CRC sobre todos os caracteres anteriores ao campo CRC. Se errado, o AFD é recusado pelo validador do MTE; corrigir antes da etapa 3.

### Task 4: Registro de marcações (ARP): store, NSR, hash, idempotência, comprovante

**Files:**
- Create: `server/ponto/store.ts`, `server/ponto/registrar.ts`
- Test: `tests/pontoRegistrar.test.ts`

**Interfaces:**
- Consumes: Task 1 `resolveConfig`, `PontoConfig`, `TipoMarcacao`; Task 2 `obraMaisProxima`; Task 3 `camposTipo7`, `hashTipo7`.
- Produces (`store.ts`):
  - `interface Estabelecimento { id: string; orgId: string; cnpj: string; razaoSocial: string; endereco?: string; config?: Partial<PontoConfig> }`
  - `interface PessoaPonto { orgId: string; rhId: string; nome: string; cpf: string; estabelecimentoId: string; vinculo: 'CLT' | 'PJ'; pinHash?: string; config?: Partial<PontoConfig> }`
  - `interface MarcacaoRegistro { id: string; orgId: string; estabId: string; nsr: number; rhId: string; cpf: string; tipo: TipoMarcacao; dataHora: string; gravadoEm: string; coletor: '01'; offline: boolean; campos: string; hash: string; prevHash: string | null; clientId: string; deviceId: string; gps: { lat: number; lng: number; precisaoM?: number } | null; face: { score: number; liveness?: number; modelo: string } | null; unitId: string | null; distM: number | null; alertas: Alerta[] }`
  - `type Alerta = 'fora_da_cerca' | 'sem_gps' | 'rosto' | 'relogio' | 'offline'`
  - `interface Ajuste { id: string; orgId: string; rhId: string; data: string; acao: 'incluir' | 'desconsiderar'; tipo?: TipoMarcacao; dataHora?: string; nsrRef?: number; estabId?: string; justificativa: string; autorUid: string; criadoEm: string }`
  - `interface PontoStore` com:
    - `getEstab`, `listEstabs(orgId)`, `saveEstab`;
    - `getPessoa(orgId, rhId)`, `listPessoas(orgId)`, `savePessoa`;
    - `listObras(orgId)` (units com `geo`);
    - `appendMarcacao(estabId, build: (prev: { nsr: number; hash: string | null }) => MarcacaoRegistro): Promise<MarcacaoRegistro>` (atômico: transação no Firestore, fila em memória). `prev.hash` é o do último **tipo 7**;
    - `appendEvento(estabId, build: (nsr: number) => EventoRegistro): Promise<EventoRegistro>`, com `interface EventoRegistro { id: string; orgId: string; estabId: string; nsr: number; tipo: 2 | 5; linha: string; gravadoEm: string }`. Usa a **mesma sequência de NSR** das marcações e não altera o `lastHash`. Grava em `ponto_eventos/{estabId}__{nsr}`;
    - `listEventosEstab(estabId, desde, ate)`;
    - `findByClientId(orgId, clientId)`;
    - `listMarcacoes(orgId, { rhId?, desde: string, ate: string })` (por `dataHora`);
    - `listMarcacoesEstab(estabId, desde, ate)`;
    - `addAjuste`, `listAjustes(orgId, { rhId?, desde, ate })`;
    - mais os métodos de aparelho da Task 5.
  - `memoryPontoStore()` e `firestorePontoStore(): PontoStore | null`. Coleções:
    - `ponto_estabelecimentos/{id}`;
    - `ponto_pessoas/{orgId}__{rhId}`;
    - `ponto_estab_state/{estabId}` `{lastNsr, lastHash}`;
    - `ponto_marcacoes/{estabId}__{nsr com 9 dígitos}`;
    - `ponto_ajustes/{id}`;
    - obras de `units` (`where orgId ==`).
- Produces (`registrar.ts`):
  - `interface MarcacaoInput { clientId: string; deviceId: string; rhId: string; tipo: TipoMarcacao; dataHora: string; offline: boolean; gps: MarcacaoRegistro['gps']; face: MarcacaoRegistro['face']; relogio: { sincronizadoEm: string; decorridoMs: number } | null }`
  - `interface Comprovante { nsr: number; empresa: { razaoSocial: string; cnpj: string }; pessoa: { nome: string; cpf: string }; tipo: TipoMarcacao; dataHora: string; obra: { unitId: string; nome: string } | null; hash: string; alertas: Alerta[] }`
  - `registrarMarcacao(store: PontoStore, orgId: string, input: MarcacaoInput, now: () => Date, opts?: { faceMin?: number /*0.6*/ }): Promise<{ registro: MarcacaoRegistro; comprovante: Comprovante; duplicada: boolean }>`
  - `class PontoErro extends Error { status: 400 | 404 }`: pessoa sem cadastro de ponto → 404; `tipo` ou `dataHora` inválidos → 400.

- [ ] **Step 1: tests** (a fixture cria estabelecimento `e1`, pessoa `r1` com CPF válido e obra `u1` com geo)

```ts
test('primeira marcação: NSR 1, hash sem anterior, comprovante completo', async () => { /* nsr===1, prevHash===null, comprovante.pessoa.cpf==='52998224725', obra.unitId==='u1', alertas==[] */ });
test('NSR sobe de 1 em 1 e o hash encadeia', async () => { /* r2.nsr===2 && r2.prevHash===r1.hash */ });
test('mesmo clientId devolve o mesmo registro, sem duplicar', async () => { /* duplicada===true, nsr igual, listMarcacoesEstab.length===1 */ });
test('20 marcações simultâneas: NSRs 1..20 sem buraco e corrente íntegra', async () => {
  const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => registrarMarcacao(store, 'org', inp({ clientId: 'c' + i }), now)));
  const nsrs = rs.map((r) => r.registro.nsr).sort((a, b) => a - b);
  assert.deepEqual(nsrs, Array.from({ length: 20 }, (_, i) => i + 1));
  const todos = (await store.listMarcacoesEstab('e1', '2000-01-01', '2100-01-01')).sort((a, b) => a.nsr - b.nsr);
  todos.forEach((r, i) => assert.equal(r.prevHash, i ? todos[i - 1].hash : null));
});
test('fora da cerca, sem GPS, rosto baixo, relógio > 30 s e offline: grava com alertas', async () => { /* alertas contém cada um; nunca lança */ });
test('relógio: esperado = sincronizadoEm + decorridoMs; 30 s de folga', async () => { /* 29 s sem alerta; 31 s com 'relogio' */ });
test('pessoa sem cadastro de ponto → PontoErro 404; tipo inválido → 400', async () => {});
```

- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement.**
  - `gravadoEm` = `now()` no fuso -03:00.
  - `campos` = `camposTipo7({ nsr, dataHora, cpf, gravadoEm, coletor: '01', offline })`.
  - `hash` = `hashTipo7(campos, prev.hash)`.
  - `relogio` nulo não gera alerta. `face` nulo também não (modo sem biometria).
  - A store em memória serializa `appendMarcacao` com uma fila de Promises por estabelecimento.
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5:** commit `feat(ponto): registro de marcações com NSR, hash encadeado e comprovante`.

### Task 5: Aparelhos: pareamento por código e assinatura

**Files:**
- Create: `server/ponto/devices.ts`
- Modify: `server/ponto/store.ts` (métodos de aparelho)
- Test: `tests/pontoDevices.test.ts`

**Interfaces:**
- Consumes: Task 4 `PontoStore`, `PessoaPonto`.
- Produces:
  - `interface Device { id: string; orgId: string; modo: 'pessoal' | 'totem'; rhId?: string; unitId?: string; publicKeyJwk: JsonWebKey; nome: string; criadoEm: string; revogadoEm?: string }`
  - `interface Pairing { code: string; orgId: string; modo: 'pessoal' | 'totem'; rhId?: string; unitId?: string; expiraEm: string; usadoEm?: string; criadoPor: string }`
  - Na store:
    - `savePairing`, `getPairing(code)`, `markPairingUsed(code, at)` (atômico: só a primeira chamada vence, devolve `boolean`);
    - `saveDevice`, `getDevice(id)`, `listDevices(orgId)`, `revokeDevice(id, at)`.
    - Coleções `ponto_pairings/{code}` e `ponto_devices/{id}`.
  - `criarPareamento(store, p: { orgId: string; modo: 'pessoal' | 'totem'; rhId?: string; unitId?: string; criadoPor: string }, now: () => Date): Promise<Pairing>`
    - código de 8 caracteres de `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`;
    - validade de 10 min;
    - modo pessoal exige pessoa com CPF válido e estabelecimento, senão `PontoErro(400, 'Cadastre CPF e estabelecimento antes de parear.')`.
  - `concluirPareamento(store, p: { code: string; publicKeyJwk: JsonWebKey; nome: string }, now): Promise<Device>`
    - código inexistente, vencido ou usado → `PontoErro(400, 'Código inválido ou vencido.')`;
    - modo pessoal revoga os aparelhos anteriores da mesma pessoa.
  - `verificarAssinatura(publicKeyJwk: JsonWebKey, payload: string, signatureB64: string): Promise<boolean>` (WebCrypto ECDSA P-256 / SHA-256, assinatura no formato IEEE P1363, que é o padrão do WebCrypto)

- [ ] **Step 1: tests** (as chaves vêm de `crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'}, true, ['sign','verify'])`)

```ts
test('código de 8 caracteres, uso único, vence em 10 min', async () => { /* segunda conclusão → 400; now+11min → 400 */ });
test('pessoa sem CPF ou sem estabelecimento não pareia', async () => { /* PontoErro 400 com a mensagem acima */ });
test('novo celular da mesma pessoa revoga o anterior', async () => { /* device1.revogadoEm definido */ });
test('assinatura válida passa; payload alterado ou outra chave falha', async () => {});
test('totem pareia a uma obra e não exige pessoa', async () => {});
```

- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** commit `feat(ponto): pareamento de aparelho por código e assinatura ECDSA`.

### Task 6: Rotas do aparelho (públicas, autenticadas pela assinatura)

**Files:**
- Create: `server/pontoRoutes.ts` (`createPontoRouter`)
- Modify:
  - `server/authMiddleware.ts`: acrescentar `/^\/api\/ponto\/device\//` em `PUBLIC_API_PATTERNS`, com comentário de que a assinatura é conferida no router;
  - `server.ts`: `app.use('/api/ponto', createPontoRouter());` logo após `/api/travel`.
- Test: `tests/pontoDeviceRoutes.test.ts` (express em porta 0, como `tests/travelProviderRoutes.test.ts`)

**Interfaces:**
- Consumes: Tasks 4 e 5.
- Produces:
  - `createPontoRouter(opts?: { store?: () => PontoStore | null; now?: () => Date; afterRegistro?: (orgId: string, dataISO: string) => Promise<void> }): Router`
  - `GET /device/time` → `{ agora: ISO }`
  - `POST /device/pair` `{ code, publicKeyJwk, nome }` → `{ deviceId, modo, rhId?, unitId?, pessoa?: { nome }, config }`
  - `GET /device/me` (cabeçalhos `x-ponto-device` e `x-ponto-sig`; a assinatura cobre `GET /device/me|<agora em minutos>`) → `{ modo, pessoa?, pessoas?: {rhId,nome}[] (totem: os da obra), config, ultimasDoDia }`
  - `POST /device/marcacoes` `{ items: { payload: string; signature: string }[] }` (até 200) → `{ results: ({ clientId, ok: true, comprovante } | { clientId?, ok: false, error })[] }`
    - `payload` é o JSON de `MarcacaoInput` sem `deviceId`; o servidor injeta o `deviceId` do cabeçalho;
    - no modo pessoal, `rhId` precisa ser o do aparelho;
    - no totem, `rhId` precisa ser de pessoa da obra do totem.

- [ ] **Step 1: tests**

```ts
test('parear e registrar uma marcação online devolve comprovante', async () => {});
test('lote offline com 3 itens, um com assinatura errada: 2 ok, 1 erro, status 200', async () => {});
test('reenvio do mesmo lote devolve os mesmos NSRs', async () => {});
test('aparelho revogado ou desconhecido → 401', async () => {});
test('celular pessoal não marca para outra pessoa; totem não marca para quem é de outra obra', async () => {});
test('mais de 200 itens → 400', async () => {});
test('a rota do aparelho não exige login (está em PUBLIC_API_PATTERNS)', () => { assert.ok(isPublicApiPath('/api/ponto/device/marcacoes')); });
```

- [ ] **Step 2–4:** FAIL → implement → PASS. `afterRegistro` é chamado depois de cada registro novo; a falha dele só gera log.
- [ ] **Step 5:** commit `feat(ponto): API do aparelho (parear, hora oficial, marcações em lote)`.

### Task 7: Rotas do RH: estabelecimentos, pessoas, pareamento, espelho, painel do dia, ajustes, AFD, aparelhos

**Files:**
- Create: `server/ponto/espelho.ts`
- Modify: `server/pontoRoutes.ts`
- Test: `tests/pontoEspelho.test.ts`, `tests/pontoRhRoutes.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 3, 4 e 5.
- Produces:
  - `montarEspelho(p: { marcacoes: MarcacaoRegistro[]; ajustes: Ajuste[]; cfg: PontoConfig; inicio: string; fim: string }): { dias: { data: string; marcacoes: { nsr?: number; tipo: TipoMarcacao; dataHora: string; origem: 'ponto' | 'ajuste'; desconsiderada: boolean; alertas: Alerta[] }[]; horas: ReturnType<typeof horasDoDia> }[]; totais: { hn: number; h50: number; h100: number; diasIncompletos: number } }`
  - Rotas (mesmo router, todas com `orgId` em query ou body):
    - `GET /estabelecimentos` (rh 1);
    - `PUT /estabelecimentos/:id` (rh 2), que valida o CNPJ com 14 dígitos. Criar o estabelecimento, ou mudar CNPJ ou razão social, grava um evento **tipo 2**;
    - `GET /pessoas` (rh 1): lista `rh_directory` ativo junto com `ponto_pessoas` → `{ rhId, nome, cpfMascarado, vinculo, batePonto, estabelecimentoId, temRosto: false, aparelho?: { id, nome } }[]`. O CPF volta mascarado (`***.982.247-**`);
    - `PUT /pessoas/:rhId` (rh 2) `{ cpf?, vinculo, batePonto, estabelecimentoId, pin?, config? }`: valida com `isValidCpf` e guarda `pinHash` com scrypt. Quando a pessoa entra no ponto pela primeira vez, ou muda CPF ou nome, grava um evento **tipo 5** (`I` ou `A`) no estabelecimento dela. O `cpfResp` vem de `ponto_pessoas` do usuário logado, se houver, ou fica zerado. Desligar `batePonto` grava `E`;
    - `POST /pareamentos` (rh 2 no modo pessoal; Admin ou Gerente no totem) → `{ code, expiraEm }`;
    - `GET /espelho?rhId&inicio&fim` (rh 1);
    - `GET /dia?data` (rh 1) → `{ pessoas: { rhId, nome, marcacoes, proxima, alertas, incompleto }[] }`, só de quem tem `batePonto`;
    - `POST /ajustes` (rh 2), com `justificativa` obrigatória de no mínimo 5 caracteres;
    - `GET /afd?estabId&inicio&fim` (rh 1) → `text/plain; charset=ISO-8859-1`, com `Content-Disposition` `AFD_<cnpj>_<inicio>_<fim>.txt` e o corpo em `Buffer.from(txt, 'latin1')`. As linhas juntam os eventos do período (`linha`) e as marcações do período (`linhaTipo7(campos, hash)`);
    - `GET /aparelhos` (rh 1);
    - `DELETE /aparelhos/:id` (rh 2), que revoga e não apaga.

- [ ] **Step 1: tests**

```ts
// pontoEspelho
test('ajuste "desconsiderar" risca a marcação e recalcula as horas', () => {});
test('ajuste "incluir" completa um dia incompleto', () => {});
test('marcação offline de ontem gravada hoje aparece no dia de ontem', () => {});
test('totais somam hn/h50/h100 e contam dias incompletos', () => {});
// pontoRhRoutes
test('CPF inválido → 400; válido volta mascarado na lista', async () => {});
test('Operações (sem área RH) → 403 em todas as rotas do RH', async () => {});
test('AFD baixa em latin1 com o nome AFD_<cnpj>_<inicio>_<fim>.txt e só o estabelecimento pedido', async () => {});
test('ajuste sem justificativa → 400', async () => {});
test('incluir pessoa no ponto e trocar CPF geram tipo 5 (I e A); criar estabelecimento gera tipo 2; tudo na mesma sequência de NSR das marcações e no AFD', async () => {});
test('revogar aparelho mantém o registro com revogadoEm', async () => {});
```

- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** commit `feat(ponto): espelho, ajustes, AFD e cadastros do ponto no RH (API)`.

### Task 8: Ponto alimenta o Diário (decisão A)

**Files:**
- Create: `src/ponto/diario.ts`, `public/operacoes/ponto.js`
- Modify:
  - `server/pontoRoutes.ts` (o `afterRegistro` padrão);
  - `public/operacoes/index.html`: carregar `ponto.js`; em `linhaDiario`, sem linha lançada, usar a sugestão; mostrar o selo "do ponto".
- Test: `tests/pontoDiario.test.ts`, `tests/opsPontoDiario.test.ts`

**Interfaces:**
- Consumes: Task 1 `horasDoDia`; Task 7 `montarEspelho`, para aplicar os ajustes.
- Produces:
  - `sugestoesDoDia(p: { dataISO: string; porPessoa: { rhId: string; cfg: PontoConfig; marcacoes: { tipo: TipoMarcacao; dataHora: string; unitId: string | null }[] }[] }): Record<string, { hn: number; h50: number; h100: number; obra: string | null; incompleto: boolean; marcacoes: string[] /*HH:mm*/ }>`
    - a obra é a `unitId` da primeira marcação do dia que tiver obra.
  - O `afterRegistro` padrão recalcula o dia e grava `ops_orgs/{orgId}/ponto_dia/{dataISO}` = `{ linhas: <sugestoes>, atualizadoEm }` (Admin SDK).
  - `public/operacoes/ponto.js` expõe `window.PontoDiario = { sugestao(pontoDia, colab) }`, que devolve `{ obra, hn, h50, h100, doPonto: true, incompleto }` ou `null`. A busca é pela chave `colab.rhId`.
  - No `index.html`, o Diário lê `db.doc('ponto_dia/'+iso)` ao abrir o dia (guardado em `S.pontoDia[iso]`).
  - Sem linha lançada, `linhaDiario` usa a sugestão, mostra "do ponto" e deixa a obra editável e as horas só leitura. Se `incompleto`, mostra "ponto incompleto" e não preenche horas.

- [ ] **Step 1: tests**

```ts
// pontoDiario
test('sugestão do dia: horas pela jornada e obra da primeira marcação com obra', () => {});
test('dia incompleto: horas 0 e incompleto true', () => {});
// opsPontoDiario (carrega public/operacoes/ponto.js com node:vm num contexto { window: {} })
test('PontoDiario.sugestao acha pela rhId e devolve null sem dado', () => {});
test('index.html carrega ponto.js e lê ponto_dia', () => {
  const html = readFileSync('public/operacoes/index.html', 'utf8');
  assert.match(html, /<script src="ponto\.js"><\/script>/); assert.match(html, /ponto_dia\//);
});
```

- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** commit `feat(ponto): Diário vem preenchido com as horas do ponto`.

### Task 9: Regras do Firestore

**Files:**
- Modify: `firestore.rules`
- Test: `tests/emulator/pontoRules.test.ts`

**Interfaces:** nenhuma nova.

- [ ] **Step 1: test** (padrão de `tests/emulator/travelProviderAccountsRules.test.ts`)

```ts
test('coleções do ponto: nem Admin lê ou grava pelo navegador', async () => {
  for (const p of ['ponto_marcacoes/e1__000000001','ponto_eventos/e1__000000002','ponto_estab_state/e1','ponto_pessoas/org_a__r1','ponto_devices/d1','ponto_pairings/ABCD2345','ponto_ajustes/a1','ponto_estabelecimentos/e1']) {
    await assertFails(getDoc(doc(admin, p))); await assertFails(setDoc(doc(admin, p), { orgId: 'org_a' }));
  }
});
test('ponto_dia: Operações lê, ninguém grava pelo navegador', async () => {
  await assertSucceeds(getDoc(doc(opsUser, 'ops_orgs/org_a/ponto_dia/2026-11-25')));
  await assertFails(setDoc(doc(opsUser, 'ops_orgs/org_a/ponto_dia/2026-11-25'), { linhas: {} }));
});
```

- [ ] **Step 2:** `npm run test:emulator` → FAIL.
- [ ] **Step 3:** acrescentar um `match` com `allow read, write: if false` para cada coleção do ponto. No `match /ops_orgs/{orgId}/{coll}/{docId}`, negar a escrita quando `coll == 'ponto_dia'`.
- [ ] **Step 4:** PASS. Se o emulador não baixar no ambiente, registrar no ledger que roda no CI.
- [ ] **Step 5:** commit `feat(ponto): regras — dados do ponto só no servidor`.

### Task 10: Localização da obra

**Files:**
- Modify:
  - `src/types/index.ts`: `Unit.geo?: { lat: number; lng: number; raioM?: number } | null`;
  - `src/modules/StructureModule.tsx`: campos Latitude, Longitude e Raio (m) no formulário da obra, mais o botão "Usar minha localização" (`navigator.geolocation`).
- Create: `src/ponto/geoInput.ts`
- Test: `tests/pontoGeoInput.test.ts`

**Interfaces:**
- Produces: `parseGeoInput(lat: string, lng: string, raio: string): { lat: number; lng: number; raioM?: number } | null | 'invalido'`
  - aceita vírgula decimal;
  - lat entre −90 e 90, lng entre −180 e 180, raio entre 20 e 5000;
  - tudo vazio → `null`.

- [ ] **Step 1: tests**

```ts
test('aceita vírgula, valida faixas, vazio = null', () => {
  assert.deepEqual(parseGeoInput('-23,5505', '-46,6333', '300'), { lat: -23.5505, lng: -46.6333, raioM: 300 });
  assert.equal(parseGeoInput('', '', ''), null);
  assert.equal(parseGeoInput('-95', '0', ''), 'invalido');
  assert.equal(parseGeoInput('-23', '-46', '10'), 'invalido');
});
```

- [ ] **Step 2–4:** FAIL → implement → PASS. Verificar `npx tsc --noEmit` sem erros novos.
- [ ] **Step 5:** commit `feat(obras): localização e raio da obra para a cerca do ponto`.

### Task 11: Aba "Ponto" no RH

**Files:**
- Create: `src/components/rhPayroll/RhPontoManager.tsx`, `src/services/pontoApi.ts`
- Modify: `src/modules/RhPayrollModule.tsx` (acrescentar `'rh-ponto'` em `RhSubSection` e na lista `tabs`, com rótulo "Ponto" e o ícone `Clock` do lucide)
- Test: `tests/pontoApi.test.ts`

**Interfaces:**
- Consumes: rotas da Task 7, via `apiFetch` de `src/apiAuthFetch`.
- Produces:
  - `pontoApi` (funções finas sobre `apiFetch`);
  - `mascaraCpf(cpf: string): string`;
  - `minutosParaHHmm(h: number): string` (1,5 → `"1:30"`);
  - `RhPontoManager` com sub-abas:
    - **Hoje:** lista do dia, com o selo da próxima marcação, os alertas e os pendentes;
    - **Espelho:** pessoa e período, tabela por dia, totais e botão de ajuste com justificativa;
    - **Pessoas:** CPF, vínculo, "Bate ponto", estabelecimento, PIN e "Parear celular", que mostra QR + código com a lib `qrcode` já instalada e a validade;
    - **Estabelecimentos:** CNPJ, razão social, jornada (início, fim, almoço, dias), 2 ou 4 marcações, raio, tolerância e feriados;
    - **Aparelhos:** lista, revogar e "Parear totem" (escolhe a obra);
    - **AFD:** estabelecimento, período e "Baixar AFD".
  - Visual: segue o design system atual do RH (o mesmo de `RhEmployeesManager`).

- [ ] **Step 1: tests**

```ts
test('minutosParaHHmm', () => { assert.equal(minutosParaHHmm(1.5), '1:30'); assert.equal(minutosParaHHmm(0), '0:00'); assert.equal(minutosParaHHmm(9), '9:00'); });
test('mascaraCpf', () => assert.equal(mascaraCpf('52998224725'), '***.982.247-**'));
```

- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** verificação: `npx tsc --noEmit` com 0 erros e `npm run build` ok. Abrir RH › Ponto no dev server e conferir cada sub-aba renderizando com a store vazia (estados vazios com instrução: "Cadastre um estabelecimento para começar").
- [ ] **Step 6:** commit `feat(rh): aba Ponto (hoje, espelho, pessoas, estabelecimentos, aparelhos, AFD)`.

### Task 12: Fechamento

- [ ] `npm test` todo verde; `npx tsc --noEmit` com 0 erros; `npm run build` ok.
- [ ] `docs/hospedagem-credenciais.md`: nada novo de secret. Registrar só que o ponto usa o mesmo Admin SDK.
- [ ] PR para `main` com o resumo, a lista de rulings e "o app (plano 2) consome `/api/ponto/device/*`".
