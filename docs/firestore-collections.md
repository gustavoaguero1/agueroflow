# Firestore collections

Inventory of every collection the client (`src/`) touches, and how `firestore.rules` scopes it.
Claims (set by the server): `{ master: boolean, orgs: { [orgId]: Role } }`. Master passes every org check.
Anything not listed here, and not in `firestore.rules`, is denied. The server (Admin SDK) bypasses rules.

Owner kinds:
- **orgId** / **organizationId**: field on the doc. Reads and writes need at least one owner field, and every owner
  field present must be one of the caller's orgs (a mixed-owner doc needs both). Updates may not change either field.
- **doc id**: the doc id is the orgId.
- **immutable**: create by a member of the doc's org, read like orgId, never updated or deleted.

| Collection | Owner | Client queries | Notes |
|---|---|---|---|
| assets | orgId | `orgId ==` | |
| audit_logs | orgId (immutable) | `orgId ==` | append-only |
| checklist_runs | orgId | `orgId ==` | |
| checklist_templates | orgId | `orgId ==` | |
| collective_asset_categories | orgId | `orgId ==` | |
| collective_asset_movements | orgId | `orgId ==`, `orgId ==` + `status in` | AiAssistantModule queried `organizationId` (never written); fixed to `orgId` |
| collective_asset_policies | doc id | getDoc | written in transactions |
| collective_asset_services | orgId | `orgId ==` | |
| collective_asset_workers | orgId | `orgId ==` | |
| collective_assets | orgId (+ optional `organizationId` alias) | `orgId ==` | AiAssistantModule fixed as above |
| commercial_clients | organizationId | `organizationId ==` | |
| commercial_cost_compositions | organizationId | `organizationId ==`, getDoc | |
| commercial_imports | organizationId | `organizationId ==` | |
| commercial_materials | organizationId | `organizationId ==` | |
| commercial_policies | doc id | getDoc | doc id = organizationId |
| commercial_proposal_items | organizationId, parent `commercial_proposals/{proposalId}` | `proposalId ==` only | read/delete also allowed via the parent proposal's org (`get()`), so the proposalId-only query works; create/update need the parent to exist and share the item's organizationId |
| commercial_proposals | organizationId | `organizationId ==`, getDoc | |
| construction_milestones | orgId | `orgId ==` | Marcos do cronograma por contrato/obra; guarda peso, avanço físico, início e término previstos, início e conclusão reais e responsável. O template cria etapas zeradas e não sobrescreve medições existentes. |
| construction_reports | orgId | `orgId ==` | |
| constructions | orgId | `orgId ==` | |
| contracts | orgId | `orgId ==` | |
| cost_centers | orgId | `orgId ==` | |
| counters | orgId | getDoc | `{orgId}_work_orders` sequence for OS numbers (written in a transaction by `markProposalWon`) |
| field_workers | orgId | `orgId ==` | |
| finance_categories | orgId | `orgId ==` | Admin/Gerente/Supervisor create/update; Admin/Gerente delete; default chart ids `cat_{orgId}_{slug}` |
| finance_receivables | orgId | `orgId ==` | Contas a receber manuais; Admin/Gerente/Supervisor com Financeiro nível 2 podem criar (`recv_{orgId}_*`). O valor original é imutável no cliente; acumuladores, saldo e status de recebimento só mudam pela transação autenticada do backend. |
| finance_receivable_receipts | orgId | `orgId ==` | Eventos imutáveis de recebimento parcial ou quitação; backend exclusivo para escrita. Preservam snapshot da conta, valor recebido, saldo antes/depois, data, forma, referência e responsável. |
| finance_payable_authorizations | orgId | `orgId ==` | Backend autenticado via Admin SDK é o único escritor; clientes apenas leem. Uma autorização documental por título (`paya_{orgId}_{payableId}`), criada por Admin/Gerente com Financeiro nível 2 a partir de ocorrência aprovada e título NF-e em aberto da mesma OC/fornecedor/chave. Registra valor e vencimento no momento; imutável, sem excluir/editar e sem marcar pagamento. |
| finance_payable_settlements | orgId | `orgId ==` | Eventos imutáveis de pagamento parcial, quitação ou abatimento, um por chave de idempotência (`pays_{orgId}_{payableId}_{operationKey}`); escritos exclusivamente pelo backend na mesma transação que atualiza os acumuladores do título. Preservam dinheiro pago, abatimento/justificativa, saldo antes/depois, forma, referência, snapshot, autorização e responsável. Clientes apenas leem; sem edição/exclusão. |
| finance_bank_transactions | orgId | `orgId ==` | Lançamentos importados de extratos OFX/CSV. IDs determinísticos por empresa/conta e FITID quando disponível; sem FITID, usa arquivo de origem, número da linha e dados normalizados para não colapsar duas transações legítimas idênticas. Reimportar o mesmo arquivo/linha é idempotente. Criados exclusivamente pelo backend e imutáveis para o cliente. | 
| finance_bank_reconciliations | orgId | `orgId ==` | Vínculos imutáveis, um por lançamento bancário e por evento de pagamento. Exigem débito e valor em dinheiro exatamente igual ao pagamento registrado; confirmação manual por Admin/Gerente com Financeiro nível 2. Não alteram título, saldo ou evento de pagamento. |
| finance_payables | orgId | `orgId ==` | create by Admin/Gerente/Supervisor with `createdBy` = caller and no payment accumulators; Admin/Gerente may edit open-title fields only; payment totals/balance, settlement metadata and paid state change only through the authenticated backend transaction. Original `valor` is preserved; `valorPago`, `valorAbatido` and `saldoAberto` track the ledger. NF-e ids `pay_{orgId}_{chave}_{parcela}` remain create-if-absent; OC/OS/receipt references remain intact |
| finance_reconciliation_cases | orgId | `orgId ==` | Registro imutável de divergência entre OC/NF-e/recebimento. Supervisor+ com Financeiro nível 2 abre (`rcase_{orgId}_*`); Admin/Gerente com Financeiro nível 2 inicia análise e aprova/rejeita com justificativa; sem exclusão. Snapshot dos valores e quantidades, incluindo as chaves das NF-e, fica preservado; não bloqueia nem libera títulos automaticamente. |
| finance_rules | orgId | `orgId ==` | same roles; learned classification `cnpj_ncm:` keys |
| hr_onboardings | organizationId | `organizationId ==` | status merge-writes on missing docs are denied (no owner); they are best-effort |
| inspections | orgId | `orgId ==` | |
| item_categories | orgId | `orgId ==` | |
| items | orgId | `orgId ==` | |
| lpu_approvals | orgId | `orgId ==` | |
| nfe_documents | orgId | `orgId ==` | created/deleted by the server only; Admin/Gerente/Supervisor may change only `status`/`classificacao`/`erroClassificacao`/`updatedAt`: start a run (→classificando, `classificacao.by` = caller), the run's owner ends it (→classificada\|erro_classificacao); Admin/Gerente may release a run older than 2 min (server time) |
| nfe_sync | doc id | getDoc | read by members; server-only writes |
| occurrences | orgId | `orgId ==` | |
| ops_orgs/{orgId}/{coll}/{doc} | path (orgId) | full collection listeners | módulo Operações (`public/operacoes`, ponte `src/modules/operations/opsBridge.ts`). Membros leem/escrevem; Visualizador só lê; `salarios` só Admin/Gerente; `membros` e `config/params` escrita Admin/Gerente |
| order_events | orgId (immutable) | `orgId ==` + `orderId ==` | timeline |
| order_messages | orgId | `orgId ==` + `orderId ==` | |
| org_members | orgId | see notes | read: member of `orgId`, own doc (`userId == uid`, or `uid == member_<docId>`), or verified token email (lowercased) == `userEmail`. Master may move a member to another org (`MasterCompanySelectorPage`). create/update/delete: master or Admin/Gerente of the org; a Gerente cannot create, change or delete an Admin; Admin/Gerente cannot change `orgId`. Self-update limited to `userName, updatedAt, lastLoginAt`. Nobody writes `passwordHash` or changes `userId`; on create `userId` is absent, `''` or the caller's uid |
| organizations | doc id | full list, `slug ==`, `name ==` | read: any signed-in user. create/delete: master. update: master or Admin of that org |
| overtime_rules | doc id | getDoc / onSnapshot | |
| purchasing_orders | organizationId | `organizationId ==` | Estoque: nível 1 lê; nível 2 grava. Financeiro: leitura somente para conciliar NF-e/OC; sem escrita. |
| purchasing_quotations | organizationId | `organizationId ==` | Estoque: nível 1 lê; nível 2 grava. |
| purchasing_receipts | organizationId | `organizationId ==` | Recebimento físico; documento idempotente por NF-e/empresa. Atualiza OC, `stock_balances` e `stock_movements` na mesma transação; quantidade não conforme não entra no saldo. Financeiro: leitura somente para conciliar NF-e/recibo; sem escrita. |
| purchasing_requisitions | organizationId | `organizationId ==` | Estoque: nível 1 lê; nível 2 grava. |
| purchasing_suppliers | organizationId | `organizationId ==` | Estoque: nível 1 lê; nível 2 grava. |
| recurring_orders | orgId | `orgId ==` | |
| rh_batches | orgId | `orgId ==` | |
| rh_calculations | orgId | `orgId ==` | |
| rh_employees | orgId | `orgId ==` | |
| rh_imports | orgId | `orgId ==` | |
| stock_balances | orgId | `orgId ==` | |
| stock_movements | orgId (immutable) | `orgId ==` | Append-only; entradas por recebimento registram OC, NF-e, recibo, custo unitário/total e referência idempotente. | |
| support_tickets | orgId | `orgId ==` | |
| teams | orgId | `orgId ==` | |
| test | none | getDoc `test/connection` | connectivity probe; `get` of that one doc for signed-in users |
| travel_requests | organizationId | `organizationId ==` | |
| travel_searches | organizationId | `organizationId ==` | |
| trusted_devices | orgId + userId | `userId == && orgId ==`, `orgId ==` | read: org members. create: own `userId` only. update/delete: owner or Admin/Gerente; `userId`/org unchanged |
| units | orgId | `orgId ==` | |
| whatsapp_ai_rules | none (server-wide bridge) | full list | see WhatsApp below |
| whatsapp_ai_settings | none | — | |
| whatsapp_contacts | none | full list | |
| whatsapp_nd_records | optional organizationId | full list | no client delete |
| whatsapp_nd_rules | optional organizationId | full list | |
| whatsapp_ocr_receipts | none | full list | no client delete |
| whatsapp_quick_replies | none | — | |
| whatsapp_scheduled_jobs | none | full list | |
| work_order_statuses | orgId | `orgId ==` | doc id `${orgId}_${statusId}` |
| work_orders | orgId | `orgId ==` | |
| work_shifts | orgId | `orgId ==` | |
| worker_time_logs | orgId | `orgId ==` + `date` | |

Server-only (denied to every client, master included): `member_credentials` (master doc `_master_`),
`first_access_tokens`, `system_security` (old master-password doc), `users` (unused).

## Compras → Financeiro / NF-e
A autorização documental de Contas a Pagar (`finance_payable_authorizations`) é criada pelo backend autenticado com Admin SDK, por título, vinculada a uma ocorrência aprovada e a uma parcela NF-e em aberto da mesma empresa, OC, fornecedor e chave de acesso. O ID determinístico impede autorizações duplicadas para a mesma parcela. Clientes apenas leem a coleção; gravação direta via Firestore é negada. O registro preserva o valor e vencimento no momento, o gerente que aprovou a divergência e o usuário que registrou o vínculo. É imutável e não altera o estado do título, não gera pagamento e não substitui comprovante bancário.

A conciliação bancária é feita em `POST /api/finance/bank-reconciliation/import` e `POST /api/finance/bank-reconciliation/:transactionId/match`. O backend importa linhas OFX/CSV em `finance_bank_transactions` com IDs determinísticos e deduplicação, preservando arquivo de origem, data, valor, direção, histórico e identificadores. Admin/Gerente com Financeiro nível 2 confirmam manualmente vínculos imutáveis em `finance_bank_reconciliations`; o servidor valida empresa, débito, valor exato em dinheiro e unicidade do vínculo ao lançamento e ao pagamento. Sugestões na interface usam valor exato e data em até sete dias, mas nunca conciliam sozinhas. A conciliação não cria, edita, baixa ou libera títulos e não altera eventos de pagamento. Débitos podem ser conciliados manualmente com eventos de pagamento; créditos podem ser conciliados manualmente com eventos de recebimento (`finance_receivable_receipts`). Ambos exigem valor em dinheiro exato, empresa coincidente e vínculo único por lançamento bancário e evento; nenhuma correspondência é automática.

Pagamentos, quitações e abatimentos de Contas a Pagar são registrados por `POST /api/finance/payable-settlements`. Cada operação possui chave de idempotência própria e cria evento imutável em `finance_payable_settlements` na mesma transação que atualiza o título existente. O valor original da parcela não muda: `valorPago` acumula o dinheiro efetivamente pago, `valorAbatido` acumula descontos/abatimentos aprovados e `saldoAberto` representa o restante. Pagamentos parciais mantêm o título aberto; somente saldo zero muda o status para Pago. Abatimento exige motivo e Admin/Gerente com Financeiro nível 2. Pagamento mais abatimento não pode superar o saldo. Data, método, referências, responsável, snapshots e saldos antes/depois ficam no evento; reenvio da mesma chave não repete a operação. Se o título divergir de autorização anterior, a confirmação expressa continua obrigatória. O backend não executa transferência nem substitui Protheus ou comprovante bancário.

A tela de conciliação OC × NF-e é uma visão derivada, somente leitura, calculada a partir das OCs, documentos `nfe_documents` e `purchasing_receipts`. Não cria coleção nem título paralelo. A associação automática de item exige código compatível ou descrição e unidade exatas; ambiguidade fica explicitamente sem vínculo. Compara quantidade pedida, faturada, fisicamente recebida, aceita pela qualidade e efetivamente lançada no estoque. O comparativo financeiro de produtos é separado de impostos e frete; não substitui a conferência de duplicatas, pagamento ou escrituração no Protheus.


A classificação da NF-e pode ser vinculada à OC do mesmo fornecedor. A OC continua sendo compromisso de compra; o título a pagar nasce das duplicatas da NF-e, evitando gerar uma segunda obrigação financeira. Quando existe OC vinculada, a classificação não movimenta estoque: a entrada física fica exclusivamente no fluxo de Recebimento. Se o recebimento já existe, a conciliação usa o recibo e não repete as entradas; o título preserva OC, OS vinculada e recibo para rastreabilidade. Financeiro tem leitura das OCs/recibos, mas somente Estoque pode alterá-los.

## WhatsApp mirror

`src/services/composioWhatsAppClient.ts` mirrors the server's WhatsApp bridge state to `whatsapp_*` as a backup and
reads it back with unfiltered `getDocs`. The bridge is one server-wide instance: its data has no org, and the server
API (`/api/whatsapp/contacts`, `/assistant/*`, `/nd/*`, `/ocr-dashboard`) serves it to any authenticated member.
The rules match that: master or a member of at least one org, plus the old field validations. Scoping these needs the
server to tag bridge data with an org first.

## Client queries changed for the rules

- `src/modules/AiAssistantModule.tsx`: `collective_assets` / `collective_asset_movements` queried `organizationId`, which
  is never written; now `orgId`.
- `src/modules/StructureModule.tsx` (new member): the "1 company per email" duplicate check listed all `org_members`;
  it now lists the current org only. Cross-org duplicates are no longer caught on the client.
- `src/contexts/AuthContext.tsx` `findSingleActiveMember`: the email fallback (used only when the uid lookup misses,
  e.g. server down) treats `permission-denied` as "not found"; other errors still throw. The unfiltered
  case-insensitive full scan was removed (rules deny it).

Composite index for `collective_asset_movements` (`orgId` + `status`) is in `firestore.indexes.json`.

Unfiltered reads that stay: `organizations` (any signed-in user may list), `org_members` in
`MasterCompanySelectorPage` (master only), `whatsapp_*` (see above).


Contas a Receber usa `finance_receivables` para o título original e `finance_receivable_receipts` como razão imutável. `POST /api/finance/receivable-receipts` valida empresa, permissão, saldo disponível e chave de idempotência; a transação grava o evento e atualiza os acumuladores no título de forma atômica. Recebimentos parciais mantêm o status em aberto; somente saldo zero muda para Recebido. A conciliação de crédito usa `POST /api/finance/bank-reconciliation/:transactionId/match-receipt`, exige crédito bancário e igualdade exata com o dinheiro efetivamente recebido. Não emite NF-e, boleto, cobrança, transferência ou baixa fiscal.
