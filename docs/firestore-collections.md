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
| construction_milestones | orgId | `orgId ==` | |
| construction_reports | orgId | `orgId ==` | |
| constructions | orgId | `orgId ==` | |
| contracts | orgId | `orgId ==` | |
| cost_centers | orgId | `orgId ==` | |
| counters | orgId | getDoc | `{orgId}_work_orders` sequence for OS numbers (written in a transaction by `markProposalWon`) |
| field_workers | orgId | `orgId ==` | |
| finance_categories | orgId | `orgId ==` | Admin/Gerente/Supervisor create/update; Admin/Gerente delete; default chart ids `cat_{orgId}_{slug}` |
| finance_payables | orgId | `orgId ==` | create by Admin/Gerente/Supervisor with `createdBy` = caller; Admin/Gerente update; Supervisor only aberto→pago (`status`/`pagoEm`/`pagoPor`/`updatedAt`); NF-e payables ids `pay_{orgId}_{chave}_{parcela}` (create-if-absent) |
| finance_rules | orgId | `orgId ==` | same roles; learned classification `cnpj_ncm:` keys |
| hr_onboardings | organizationId | `organizationId ==` | status merge-writes on missing docs are denied (no owner); they are best-effort |
| inspections | orgId | `orgId ==` | |
| item_categories | orgId | `orgId ==` | |
| items | orgId | `orgId ==` | |
| lpu_approvals | orgId | `orgId ==` | |
| nfe_documents | orgId | `orgId ==` | created/deleted by the server only; Admin/Gerente/Supervisor may change only `status`/`classificacao`/`erroClassificacao`/`updatedAt`: start a run (→classificando, `classificacao.by` = caller), the run's owner ends it (→classificada\|erro_classificacao); Admin/Gerente may release a run older than 2 min (server time) |
| nfe_sync | doc id | getDoc | read by members; server-only writes |
| occurrences | orgId | `orgId ==` | |
| order_events | orgId (immutable) | `orgId ==` + `orderId ==` | timeline |
| order_messages | orgId | `orgId ==` + `orderId ==` | |
| org_members | orgId | see notes | read: member of `orgId`, own doc (`userId == uid`, or `uid == member_<docId>`), or verified token email (lowercased) == `userEmail`. Master may move a member to another org (`MasterCompanySelectorPage`). create/update/delete: master or Admin/Gerente of the org; a Gerente cannot create, change or delete an Admin; Admin/Gerente cannot change `orgId`. Self-update limited to `userName, updatedAt, lastLoginAt`. Nobody writes `passwordHash` or changes `userId`; on create `userId` is absent, `''` or the caller's uid |
| organizations | doc id | full list, `slug ==`, `name ==` | read: any signed-in user. create/delete: master. update: master or Admin of that org |
| overtime_rules | doc id | getDoc / onSnapshot | |
| purchasing_orders | organizationId | `organizationId ==` | |
| purchasing_quotations | organizationId | `organizationId ==` | |
| purchasing_receipts | organizationId | `organizationId ==` | |
| purchasing_requisitions | organizationId | `organizationId ==` | |
| purchasing_suppliers | organizationId | `organizationId ==` | |
| recurring_orders | orgId | `orgId ==` | |
| rh_batches | orgId | `orgId ==` | |
| rh_calculations | orgId | `orgId ==` | |
| rh_employees | orgId | `orgId ==` | |
| rh_imports | orgId | `orgId ==` | |
| stock_balances | orgId | `orgId ==` | |
| stock_movements | orgId (immutable) | `orgId ==` | |
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
