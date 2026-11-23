# Operações com dados únicos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pessoas, obras, salários, apontamento e reembolsos existem uma vez só no AgueroFlow; Operações (páginas do Inox) lê e escreve nos mesmos dados que RH, Obras/RDO e WhatsApp, sem perder nenhuma função do Inox.

**Architecture:** A página do Inox continua igual e fala com `claude.use('db')`. A ponte (`src/modules/operations/opsBridge.ts`) passa a ter **coleções virtuais**: `colaboradores`, `salarios` e `obras` são montadas juntando a fonte oficial (`rh_employees`, `units`) com um **complemento operacional** em `ops_orgs/{orgId}/colaboradores|obras` (campos que só Operações tem). O id que a página vê é o id do complemento (ids do Inox importado continuam valendo; quem só existe no RH aparece como `rh_<empId>`/`un_<unitId>`), então nada do que já referencia esses ids precisa ser remapeado. As regras de mapeamento ficam em funções puras testadas (`unifiedCollections.ts`).

**Tech Stack:** React 19 + TypeScript, Firebase modular SDK (Firestore/Storage), Express (`server.ts`), testes `node:test` via `tsx`, regras testadas no emulador.

**Spec:** decisões do usuário nesta conversa (23/11/2026): RH é o cadastro único de pessoas e Operações só visualiza a identidade; Obras/RDO, viagens e reembolsos são parte de Operações; nenhuma duplicidade; nenhuma função do Inox pode se perder; visual do AgueroFlow.

## Global Constraints

- Nenhuma tela/ação do Inox pode deixar de funcionar; o que mudar de dono (ex.: editar nome) mostra onde editar ("Edite no RH → Funcionários").
- Identidade de pessoa (nome, função/cargo, admissão, ativo/desligado, salários) só é gravada pelo RH. Exceção decidida: aprovar candidato em Contratação **cria** o funcionário no RH (é o fluxo de admissão).
- Ids existentes no Inox importado não mudam.
- Dados por empresa: tudo com `orgId` ou sob `ops_orgs/{orgId}`; regras do Firestore cobrem cada coleção nova.
- Sem duplicar: depois da Task 6, o item de menu "Recibos do WhatsApp" sai (os recibos aparecem no Reembolso).

## Review Focus

- Funcionário do RH sem complemento (nunca tocado em Operações) precisa aparecer na escala/diário com id `rh_<empId>`, e a primeira edição operacional cria o complemento com esse id (Task 2).
- Duas pessoas com o mesmo nome no Inox importado não podem ser fundidas num só funcionário do RH (Task 5: casar por nome só quando único; senão cria).
- Desligar no RH (`active:false`) deve refletir como `status:'Desligado'` na hora, e Operações não pode "reativar" pela página (Task 2).
- Obra criada pela Base de dados do Inox sem código vira uma unidade com código gerado, sem colidir com códigos existentes (Task 3).
- Recibo do WhatsApp de telefone desconhecido entra no Reembolso com `colab:''` (para escolher depois), nunca é descartado (Task 6).

---

### Task 1: Funções puras de mapeamento

**Files:**
- Create: `src/modules/operations/unifiedCollections.ts`
- Test: `tests/unifiedCollections.test.ts`

**Interfaces:**
- Produces:
  - `IDENTITY_FIELDS = ['nome','funcao','status','admissao','regime'] as const` (somente leitura em Operações)
  - `mergeColab(emp: RhEmployee | null, overlay: (Record<string, unknown> & {id:string; rhId?: string}) | null): Record<string, unknown> & {id:string}` — id = `overlay.id` ou `rh_${emp.id}`; `nome←name`, `funcao←role`, `status←active?'Ativo':'Desligado'`, `admissao←admissionDate`; demais campos do complemento; complemento sem RH (órfão) volta como está com `semRh:true`.
  - `splitColabWrite(data: Record<string, unknown>): { overlay: Record<string, unknown>; ignored: string[] }` — tira `IDENTITY_FIELDS`, devolve quais foram ignorados.
  - `salarioFromRh(emp: RhEmployee): { clt: number; pj: number; valorHora?: number }` — `clt=baseSalaryCarteira`, `pj=baseSalaryPorFora`, `valorHora=hourlyRateCarteira+hourlyRatePorFora` (se >0).
  - `mergeObra(unit: Unit | null, overlay): Record<string, unknown> & {id:string}` — id = `overlay.id` ou `un_${unit.id}`; `nome←name`, `os←code`, `cidade←city/state` ("Cidade/UF"), `coordenador←managerName`; resto do complemento.
  - `splitObraWrite(data): { unitPatch: Partial<Unit>; overlay: Record<string, unknown> }` — inverso de `mergeObra` (separa "Cidade/UF").

- [ ] **Step 1: Write the failing tests** (`mergeColab` com e sem complemento; `status` 'Desligado' quando `active:false` mesmo se o complemento disser 'Ativo'; `splitColabWrite({nome:'X',obraAtual:'o1'})` → `{overlay:{obraAtual:'o1'}, ignored:['nome']}`; `salarioFromRh` com 2500/800; `mergeObra`/`splitObraWrite` ida e volta com `'Campinas/SP'`).
- [ ] **Step 2:** `npm test` → falha (módulo inexistente).
- [ ] **Step 3:** Implementar as funções acima.
- [ ] **Step 4:** `npm test` → passa.
- [ ] **Step 5:** Commit `feat(operacoes): mapeamento RH/unidades ↔ Inox`.

### Task 2: Coleções virtuais `colaboradores` e `salarios` na ponte

**Files:**
- Modify: `src/modules/operations/opsBridge.ts` (`collectionApi`, `docApi`)
- Create: `src/modules/operations/virtualCollections.ts` (assina duas fontes e emite a junção)
- Modify: `public/operacoes/index.html` (mensagens/edição somente leitura de identidade e salário)
- Test: `tests/virtualCollections.test.ts` (com fontes falsas, sem Firebase)

**Interfaces:**
- Consumes: Task 1.
- Produces: `createVirtualCollection<A,B>(opts: { subscribeA: (cb:(rows:A[])=>void)=>Unsub; subscribeB: (cb:(rows:B[])=>void)=>Unsub; join: (a:A[], b:B[]) => Array<{id:string}> }): { onSnapshot(next, err): Unsub }` — só emite depois que as duas fontes responderam.
- Ponte: `db.collection('colaboradores').onSnapshot` = junção `rh_employees(orgId==)` × `ops_orgs/{org}/colaboradores`; `db.doc('colaboradores/<id>').update|set` grava só `splitColabWrite(...).overlay` no complemento (com `rhId` quando o id é `rh_<empId>`); se `obraAtual` mudou, atualiza também `rh_employees.codigoObra` com o código da unidade e chama `syncRhEmployeeToFieldWorker`. `db.collection('colaboradores').doc()`/criação sem `rhId` → rejeita com `code:'invalid_argument'` e mensagem "Cadastre a pessoa no RH". `salarios` = leitura de `salarioFromRh` (só gerentes, como hoje); escrita rejeitada com "Salários são editados no RH".
- Página: na Base de dados e no formulário de novo colaborador, campos de identidade/salário aparecem desabilitados com o aviso "Edite no RH → Funcionários"; o botão "Novo colaborador" leva ao RH (`window.parent.__agueroOpsGo?.('rh-funcionarios')`).

- [ ] **Step 1: Failing tests** para `createVirtualCollection`: não emite antes das duas fontes; reemite quando qualquer uma muda; unsubscribe cancela as duas.
- [ ] **Step 2:** `npm test` → falha.
- [ ] **Step 3:** Implementar `virtualCollections.ts` e ligar na ponte; expor `__agueroOpsGo` no `OperationsModule` (navega o app).
- [ ] **Step 4:** `npm test` → passa; smoke no navegador (host falso de `/home/claude/smoke`) com um RH falso: Escala lista o funcionário `rh_e1`, alocar em obra grava complemento `rh_e1` com `rhId:'e1'`.
- [ ] **Step 5:** Regras: `ops_orgs/{org}/colaboradores` segue as regras atuais; `rh_employees` update por Supervisor/Operacional só no campo `codigoObra` (adicionar ao `firestore.rules` e a `tests/emulator/opsRules.test.ts`).
- [ ] **Step 6:** Commit `feat(operacoes): pessoas e salários vêm do RH`.

### Task 3: Coleção virtual `obras` = unidades

**Files:**
- Modify: `src/modules/operations/opsBridge.ts`
- Test: `tests/unifiedCollections.test.ts` (código gerado)

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces: `nextUnitCode(existing: string[]): string` em `unifiedCollections.ts` (maior código numérico + 1; "1" se nenhum).
- Ponte: `obras` = junção `units(orgId==)` × `ops_orgs/{org}/obras`; `set/update` grava `unitPatch` na unidade e `overlay` no complemento; criação (`collection('obras').doc().set`) cria a unidade (código de `nextUnitCode` se `os` vazio) e o complemento com `unitId`. Exclusão apaga só o complemento (unidade pode ter RDO/OS ligados) e avisa.

- [ ] **Step 1:** Failing test `nextUnitCode(['198','12','A3'])==='199'`, `nextUnitCode([])==='1'`.
- [ ] **Step 2–4:** implementar, `npm test` passa, smoke: criar obra na Base aparece em "Obras e RDO".
- [ ] **Step 5:** Commit `feat(operacoes): obras são as unidades do AgueroFlow`.

### Task 4: Diário de obras alimenta o apontamento de jornada

**Files:**
- Create: `src/modules/operations/diarioToTimeLogs.ts`
- Modify: `src/modules/operations/opsBridge.ts` (após `set/update` em `diario/<data>`)
- Test: `tests/diarioToTimeLogs.test.ts`

**Interfaces:**
- Produces: `diarioToTimeLogs(orgId: string, isoDate: string, linhas: Record<string, {obra?:string; sit?:string; hn?:number; h50?:number; h100?:number; obs?:string}>, colabs: Map<string,{rhId?:string; nome:string; funcao:string}>, obras: Map<string,{nome:string; unitId?:string}>): WorkerTimeLog[]` — um registro por linha com `sit==='Trabalhou'` ou horas > 0; id determinístico `wtl_ops_${isoDate}_${colabId}`; `workerId = fw_${rhId}`; custos zerados (o painel de custo recalcula).
- Ponte: depois de gravar o diário, faz upsert desses registros em `worker_time_logs` e apaga os `wtl_ops_<data>_*` que sumiram.

- [ ] **Step 1:** Failing tests: linha "Folga" não gera registro; domingo com `h100:8` gera `overtime100Hours:8`; id determinístico.
- [ ] **Step 2–4:** implementar; `npm test` passa; smoke: lançar diário aparece em Obras e RDO → Apontamento.
- [ ] **Step 5:** Commit `feat(operacoes): diário vira apontamento de jornada`.

### Task 5: Importador casa pessoas e obras com RH e unidades

**Files:**
- Modify: `src/modules/operations/opsBridge.ts` (`importInoxBackup`)
- Modify: `src/modules/operations/inoxBackup.ts`
- Test: `tests/inoxBackup.test.ts`

**Interfaces:**
- Produces: `matchByName<T extends {name:string}>(nome: string, candidates: T[]): T | null` — compara sem acento/caixa; devolve só se houver exatamente um.
- Importação: cada colaborador do backup → `rhId` = funcionário casado por nome ou **novo** funcionário no RH (nome, função, admissão, ativo, salários do backup `salarios/<id>`); grava o complemento com o id original + `rhId`. Cada obra → `unitId` = unidade casada por código (`os`) ou nome, ou nova unidade. Resumo mostra "N casados, M criados no RH".

- [ ] **Step 1:** Failing tests de `matchByName` (acentos; homônimos → null).
- [ ] **Step 2–4:** implementar; testes passam.
- [ ] **Step 5:** Commit `feat(operacoes): importação liga pessoas ao RH e obras às unidades`.

### Task 6: Recibos do WhatsApp entram no Reembolso

**Files:**
- Create: `server/opsReimbursements.ts`
- Modify: `server.ts` (onde um recibo é salvo: `parse-receipt`, webhook e bridge)
- Modify: `src/components/layout/AppLayout.tsx` (remove "Recibos do WhatsApp")
- Test: `tests/opsReimbursements.test.ts`

**Interfaces:**
- Produces: `loteDaSemana(dataEnvio: string): string` — mesma regra do Inox (`loteAtual()` em `public/operacoes/index.html`: fecha quinta 17:00); `receiptToReembNota(receipt, colabByPhone: Map<string,string>): Record<string, unknown>` (campos de `reemb_notas` do Inox: `lote, colab, centro:'', dataEnvio, dataNota, valor, cnpj, emitente, numero, descricao, natSug, natureza, lido:true, anexos, incluir:true, origem:'whatsapp'`); `async upsertOpsReembNota(admin, orgId, receipt)` grava `ops_orgs/{orgId}/reemb_notas/wa_${receipt.id}`.

- [ ] **Step 1:** Failing tests: `loteDaSemana` antes/depois de quinta 17:00 igual ao do Inox; telefone desconhecido → `colab:''`.
- [ ] **Step 2–4:** implementar e chamar nos três pontos; testes passam.
- [ ] **Step 5:** Commit `feat(operacoes): recibos do WhatsApp caem no Reembolso`.

### Task 7: Verificação final

- [ ] `npx tsc --noEmit`, `npm test`, `npx vite build` sem erros.
- [ ] Smoke das 10 telas de Operações + Obras e RDO + RH com dados falsos (nenhuma tela com "Não consegui montar").
- [ ] Revisão de branch inteira por um revisor independente (superpowers:requesting-code-review).
- [ ] Atualizar descrição do PR.
