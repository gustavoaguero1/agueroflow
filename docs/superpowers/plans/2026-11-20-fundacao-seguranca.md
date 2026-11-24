# Fundação de Segurança — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the open database, passwords and API routes of AgueroFlow, and persist server state outside git, without breaking any existing feature.

**Architecture:** `firebase-admin` on the Express server becomes the trust anchor: it verifies passwords (scrypt, server-only collection), mints custom tokens, writes org-membership custom claims, verifies ID tokens on `/api/*`, and mirrors `data_*` files to Cloud Storage. Firestore rules check the `orgs` claim. The browser gets one fetch wrapper that attaches the ID token; existing screens keep their calls.

**Tech Stack:** Express 4, React 19, Firebase JS SDK 13, `firebase-admin`, `@firebase/rules-unit-testing`, `firebase-tools` (emulators, dev only), Node `node:test` via `tsx --test`.

**Spec:** `docs/superpowers/specs/2026-11-20-fundacao-seguranca-design.md`

## Global Constraints
- Branch `claude/epic-gates-86iss1`. AI Studio edits `main` in parallel: prefer new files; edits in `server.ts`, `AuthContext.tsx`, `StructureModule.tsx`, `MasterCompanySelectorPage.tsx`, `App.tsx`, `main.tsx`, `firestore.rules` stay surgical.
- New server code lives in `server/` (new folder). Tests in `tests/` (new folder), run with `npm test` (`tsx --test`); emulator tests with `npm run test:emulator`.
- Firestore DB id comes from `firebase-applet-config.json` → `firestoreDatabaseId`; bucket from `storageBucket`. Never hardcode them.
- Credential resolution order: ADC → env `FIREBASE_SERVICE_ACCOUNT` (JSON string) → disabled. Disabled = server starts, logs one warning, `stateSync` no-op, protected `/api` routes answer `503 {error:'auth_unavailable'}`.
- Org owner of a document = `orgId`, else `organizationId`.
- Claims shape: `{ master: boolean, orgs: { [orgId: string]: Role } }`, `Role = 'Admin'|'Gerente'|'Supervisor'|'Operacional'|'Visualizador'`.
- Master emails: env `MASTER_EMAILS` (comma list), default `gustavo@agueroinox.com.br`.
- Password min length 6 (existing rule). Hash: Node `crypto.scrypt`, format `scrypt$<saltB64>$<hashB64>`, 16-byte salt, 64-byte key.
- Password hashes only in `member_credentials/{memberId}` (master: `member_credentials/__master__`). Rules deny all access to it.
- Custom-token UID = existing `member.userId` if set, else `member_<memberId>`.
- First-access link: token `crypto.randomBytes(32).toString('hex')`, expires 7 days, single use, stored in `first_access_tokens/{token}` (rules deny all). URL `/?primeiro-acesso=<token>`.
- Webhooks require env `WEBHOOK_SECRET` via query `token` or header `x-webhook-token`; Composio webhook requires valid signature with `COMPOSIO_WEBHOOK_SECRET`, and is disabled (403) when that env is absent.
- Hosting requirement: max 1 server instance.
- User-facing messages in Portuguese, matching the existing tone.
- Steps 2–4 of the spec (Tasks 3–9) are published to `main` together, only after the diagnostics gate (Task 9) is green in the target host.

## Review Focus
1. Member with plaintext `passwordHash` logs in for the first time after deploy → login succeeds, hash migrated, plaintext field deleted. (Task 4 test `migrates plaintext password on first login`.)
2. Page reload of a password-login user (custom token, no email on the Firebase user) → session restored by `uid`, not logged out. (Task 7 manual check step + Task 4 test `session resolves member by uid without email`.)
3. A screen querying a collection whose docs carry only `organizationId` → still loads for members. (Task 8 test `organizationId-only docs readable by member`.)
4. Server restarts with an empty local disk → WhatsApp session and `data_*.json` restored before any service reads them. (Task 2 test `restore completes before importer continues` + Task 2 wiring check.)
5. Non-master Google user whose `org_members` doc has `userEmail` but no `userId` yet → first login binds `userId` server-side and grants claims. (Task 4 test `binds userId by email on session`.)

---

### Task 1: Tooling and Admin SDK bootstrap

**Files:**
- Modify: `package.json` (deps + scripts)
- Create: `firebase.json`, `server/firebaseAdmin.ts`, `tests/firebaseAdmin.test.ts`

**Interfaces:**
- Produces: `getAdmin(): AdminHandles | null` where `AdminHandles = { auth: Auth; db: Firestore; bucket: Bucket }` (from `firebase-admin`), memoized; `adminStatus(): { enabled: boolean; reason?: string }`.

- [ ] **Step 1:** Add deps `firebase-admin`; devDeps `@firebase/rules-unit-testing`, `firebase-tools`. Scripts: `"test": "tsx --test tests/*.test.ts"`, `"test:emulator": "firebase emulators:exec --only firestore,auth --project demo-agueroflow \"tsx --test tests/emulator/*.test.ts\""`. `firebase.json`: `{ "firestore": { "rules": "firestore.rules" }, "emulators": { "firestore": { "port": 8085 }, "auth": { "port": 9099 }, "ui": { "enabled": false } } }`. Run `npm install`; expected success.
- [ ] **Step 2: Failing test** `tests/firebaseAdmin.test.ts`: `test('disabled without credentials')` — with `GOOGLE_APPLICATION_CREDENTIALS`, `FIREBASE_SERVICE_ACCOUNT`, `K_SERVICE` unset and `FIREBASE_ADMIN_DISABLE_ADC=1`, `getAdmin()` returns `null` and `adminStatus().enabled === false`.
- [ ] **Step 3:** Run `npm test` → FAIL (module missing).
- [ ] **Step 4:** Implement `server/firebaseAdmin.ts`. ADC is attempted when not disabled (`FIREBASE_ADMIN_DISABLE_ADC` is a test hook only); emulator env vars (`FIRESTORE_EMULATOR_HOST`) count as enabled with `projectId` from `GCLOUD_PROJECT`. Use `getFirestore(app, firestoreDatabaseId)`; under the emulator use default DB.
- [ ] **Step 5:** `npm test` → PASS; `npm run lint` → no new errors.
- [ ] **Step 6:** Commit `chore: add firebase-admin bootstrap and test tooling`.

### Task 2: Server state mirrored to Cloud Storage

**Files:**
- Create: `server/stateSync.ts`, `server/restoreState.ts`, `tests/stateSync.test.ts`
- Modify: `server.ts:1` (first import)

**Interfaces:**
- Consumes: `getAdmin()` (Task 1).
- Produces: `interface StateStore { list(prefix: string): Promise<string[]>; download(name: string): Promise<Buffer>; upload(name: string, data: Buffer): Promise<void> }`; `restoreState(store: StateStore | null, rootDir: string, paths: string[]): Promise<{ restored: number; seeded: number }>`; `watchState(store, rootDir, paths, debounceMs = 1500): { flush(): Promise<void>; close(): void }`; `STATE_PATHS` constant = `['data_whatsapp_auth/', 'data_nd_pdfs/', 'data_*.json']`; object names `server-state/<relative path>`.

- [ ] **Step 1: Failing tests** with an in-memory `StateStore` and `fs.mkdtemp` dir:
  - `restore writes remote files locally` — store has `server-state/data_a.json` → file exists locally with same bytes, `restored === 1`.
  - `seeds bucket from local when remote empty` — local `data_b.json`, empty store → store has `server-state/data_b.json`, `seeded === 1`.
  - `uploads changed file after debounce` — write `data_whatsapp_auth/creds.json` after `watchState`; `await flush()` → store contains it.
  - `null store is a no-op` — returns `{restored:0, seeded:0}`, no throw.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement `server/stateSync.ts` (`fs.watch` on root dir + each dir path; glob match for `data_*.json`; GCS adapter `bucketStore(bucket)` using `getFiles({prefix})`, `file.download()`, `file.save()`).
- [ ] **Step 4:** Implement `server/restoreState.ts`: top-level `await restoreState(...)` then `watchState(...)`, registers `SIGTERM` → `flush()`. Root = `process.cwd()`.
- [ ] **Step 5:** Add `import './server/restoreState';` as the **first** import of `server.ts` (top-level await blocks later imports such as `whatsappWebBridgeServer`, which reads state at import time, `whatsappWebBridgeServer.ts:360`). Add test `restore completes before importer continues`: a fixture module importing a fake restore with TLA then reading a file sees the restored content.
- [ ] **Step 6:** `npm test` → PASS; `npm run dev` without credentials starts and logs the single "Firebase Admin desativado" warning.
- [ ] **Step 7:** Commit `feat: mirror server state files to Cloud Storage`.

### Task 3: Password hashing and credential store

**Files:**
- Create: `server/passwords.ts`, `tests/passwords.test.ts`

**Interfaces:**
- Produces: `hashPassword(plain: string): Promise<string>`; `verifyPassword(plain: string, stored: string): Promise<boolean>` (timing-safe; returns false on malformed `stored`).

- [ ] **Step 1: Failing tests:** `hash roundtrip`, `wrong password rejected`, `hash format is scrypt$salt$key`, `malformed stored value returns false`, `two hashes of same password differ`.
- [ ] **Step 2:** `npm test` → FAIL. **Step 3:** implement. **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: scrypt password hashing`.

### Task 4: Auth service (login, migration, claims, first access)

**Files:**
- Create: `server/authService.ts`, `tests/emulator/authService.test.ts`

**Interfaces:**
- Consumes: `getAdmin()`, `hashPassword`, `verifyPassword`.
- Produces (all take `AdminHandles` as first arg):
  - `resolveMember(h, nameOrEmail: string, company?: string): Promise<{ member: OrgMember; org: Organization } | { error: string }>` — same matching as `findSingleActiveMember` in `src/contexts/AuthContext.tsx:329` (uid → email → userName, active only) and the company filter at `:1009-1020`, same Portuguese error texts.
  - `credentialLogin(h, input: { nameOrEmail; password; company? }): Promise<{ ok: true; token: string; uid: string; isMaster: boolean; member?: OrgMember; org?: Organization } | { ok: false; error: string; isFirstAccess?: boolean; memberName?: string }>`
  - `buildClaims(h, uid: string, email?: string | null): Promise<Claims>` and `syncSession(h, uid, email?): Promise<{ claims: Claims; member: OrgMember | null }>` — binds `userId` on an email-matched member without one, then `auth.setCustomUserClaims`.
  - `setPassword(h, memberId: string, newPassword: string): Promise<void>`; `issueFirstAccessToken(h, memberId, createdBy: string): Promise<{ token: string; url: string; expiresAt: string }>`; `checkFirstAccessToken(h, token): Promise<{ memberName: string; orgName: string } | { error: string }>`; `completeFirstAccess(h, token, newPassword): Promise<{ ok: true; token: string } | { ok: false; error: string }>` (consumes token, sets password, returns custom token).
  - Master: when `nameOrEmail` ∈ `MASTER_EMAILS`, check `member_credentials/__master__`; if absent and `system_security/master_auth.passwordHash` exists, compare plaintext, migrate, delete that field; if neither exists → `{ ok:false, error:'Senha master ainda não definida. Entre com "Continuar com Google" e defina sua senha.' }`. **No hardcoded password list.** Master UID = `auth.getUserByEmail(email).uid` if it exists, else `master_<sha256(email).slice(0,16)>`; claims `{master:true, orgs:{}}`.
- [ ] **Step 1: Failing tests** (Firestore + Auth emulator, seeded per test):
  - `logs in with migrated hash` · `rejects wrong password` · `migrates plaintext password on first login` (afterwards `org_members` doc has no `passwordHash`, `member_credentials` has scrypt value) · `first access detected when no password` (`isFirstAccess:true`, no token) · `inactive member rejected` · `company filter mismatch rejected`
  - `master hardcoded passwords rejected` (`admin123` with stored `x9Secret` → fail) · `master plaintext migrated` · `master without any password gets Google-only error`
  - `session resolves member by uid without email` · `binds userId by email on session` · `claims include every active membership with role`
  - `first access token single use` · `first access token expired after 7 days` · `completeFirstAccess sets password and returns token`
- [ ] **Step 2:** `npm run test:emulator` → FAIL. **Step 3:** implement. **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat: server-side auth service with migration and claims`.

### Task 5: Auth middleware and routes

**Files:**
- Create: `server/authMiddleware.ts`, `server/authRoutes.ts`, `tests/emulator/authRoutes.test.ts`, `tests/authMiddleware.test.ts`

**Interfaces:**
- Consumes: Task 4 functions.
- Produces:
  - `PUBLIC_API_PATTERNS: RegExp[]` matching exactly: `/api/health`, `/api/auth/credential-login`, `/api/auth/first-access/check/:token`, `/api/auth/first-access/complete`, `/api/hr/onboarding/check/:token`, `/api/hr/onboarding/submit`, `/api/leads/demo`, `/api/outlook/oauth/callback`, `/api/composio/whatsapp/webhook`, `/api/webhooks/whatsapp-receipts`.
  - `requireAuth: RequestHandler` → sets `req.user: { uid: string; email?: string; master: boolean; orgs: Record<string, Role> }`; 401 `{error:'unauthenticated'}`; 503 when admin disabled.
  - `requireRole(...roles: Role[]): RequestHandler` — passes if master or `req.user.orgs[orgIdOf(req)]` ∈ roles, where `orgIdOf(req)` = `req.params.orgId ?? req.query.orgId ?? req.body?.orgId ?? req.body?.organizationId ?? sole org in claims`.
  - `requireWebhookSecret: RequestHandler` (env `WEBHOOK_SECRET`; 403 if missing env or mismatch).
  - `authRouter: Router` mounted at `/api/auth`: `POST credential-login`, `POST session`, `POST set-password` (self with current password, or `requireRole('Admin','Gerente')` for another member of the same org), `POST first-access/link` (Admin/Gerente), `GET first-access/check/:token`, `POST first-access/complete`, `POST refresh-claims/:memberId` (Admin/Gerente). Rate limit credential-login and first-access/complete: 10/min per IP.
- [ ] **Step 1: Failing unit tests** (`tests/authMiddleware.test.ts`, with stubbed verifier): `public path passes without token`, `missing token 401`, `role allowed`, `role denied 403`, `master passes any role`, `webhook secret missing 403`.
- [ ] **Step 2: Failing route tests** (emulator, `app.listen(0)` + `fetch`): `credential-login returns custom token`, `set-password by Gerente of other org 403`, `first-access link then complete`.
- [ ] **Step 3:** run both → FAIL. **Step 4:** implement. **Step 5:** run → PASS.
- [ ] **Step 6:** Commit `feat: auth middleware and auth routes`.

### Task 6: Wire security into `server.ts`

**Files:**
- Modify: `server.ts` (after `express.urlencoded` at ~:453; health at :456; onboarding routes :474-720; WhatsApp config :1886-1970, :3728-3740; receipts webhook :3937; Composio webhook :5164; reimbursements :3751-3870; hardcoded phones/tokens :1904, :3900+, :9221; AI rate limit :772)
- Modify: `.env.example`

**Interfaces:**
- Consumes: `requireAuth`, `requireRole`, `requireWebhookSecret`, `authRouter`, `getAdmin`, `adminStatus`.

- [ ] **Step 1:** `app.use('/api', (req,res,next) => PUBLIC_API_PATTERNS.some(p=>p.test(req.path)) ? next() : requireAuth(req,res,next))` and `app.use('/api/auth', authRouter)` right after the body parsers.
- [ ] **Step 2:** Add `requireRole('Admin','Gerente')` to: `POST /api/whatsapp/config`, `/api/whatsapp/bridge/connect|disconnect|send|select-group`, `/api/composio/whatsapp/connect|send|link`, `/api/whatsapp/quick-setup`, `/api/hr/onboarding/generate-link|list|:id/status|:id (DELETE)`, `/api/reimbursements/update-status|:id (DELETE)|clear-mock`, `/api/outlook/oauth/url|disconnect`. Onboarding routes take org from `req.user` (reject a body/query `orgId` the user is not a member of).
- [ ] **Step 3:** `GET /api/whatsapp/config` masks `apiKey`, `verifyToken`, `composioWebhookSecret` as `'••••' + last4`; `POST` ignores masked values.
- [ ] **Step 4:** Webhooks: `/api/webhooks/whatsapp-receipts` POST uses `requireWebhookSecret` (GET verify handshake keeps Meta `hub.verify_token` check against env `WHATSAPP_VERIFY_TOKEN`); Composio rejects missing/invalid signature.
- [ ] **Step 5:** Move `aguero_reembolsos_token_2025`, `'mude-me'`, owner fallback (número do dono) and the employee phone list to env `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_API_KEY`, `OWNER_PHONE`, `AUTHORIZED_PHONES` (comma list); document all new env vars in `.env.example` (no values).
- [ ] **Step 6:** AI rate limit key = `req.user?.uid ?? ip`.
- [ ] **Step 7:** Extend `/api/health`: when the caller sends a master token, include `diagnostics: { admin, firestoreRead, bucketWrite, customToken }` (each `true`/error string), computed live.
- [ ] **Step 8:** `npm run lint` → no new errors; `npm test` → PASS; manual: `curl localhost:3000/api/whatsapp/config` → 401; `curl /api/health` → 200.
- [ ] **Step 9:** Commit `feat: require auth on api routes and move secrets to env`.

### Task 7: Client — token on fetch, login via server, first-access page

**Files:**
- Create: `src/apiAuthFetch.ts`, `src/pages/FirstAccessPage.tsx`, `tests/apiAuthFetch.test.ts`
- Modify: `src/main.tsx`, `src/App.tsx:56-62` (public route branch), `src/contexts/AuthContext.tsx` (`signInWithCredentials` :874-1072, `setupFirstAccessPassword` :694, `changeUserPassword`, `adminSetUserPassword`, `onAuthStateChanged` :443), `src/modules/StructureModule.tsx:374`, `src/pages/MasterCompanySelectorPage.tsx:238`

**Interfaces:**
- Consumes: `/api/auth/*` (Task 5).
- Produces: `installApiAuthFetch(getToken: () => Promise<string | null>, target = window): void` — wraps `fetch` for same-origin URLs starting with `/api/` (string, `URL` or `Request`), sets `Authorization: Bearer <token>` unless already present; other URLs untouched.

- [ ] **Step 1: Failing tests:** `adds bearer to /api calls`, `leaves external urls untouched`, `keeps existing authorization header`, `no token → no header`.
- [ ] **Step 2:** `npm test` → FAIL. **Step 3:** implement; `main.tsx` calls `installApiAuthFetch(() => auth.currentUser?.getIdToken() ?? Promise.resolve(null))` before render. **Step 4:** → PASS.
- [ ] **Step 5:** `AuthContext`:
  - `onAuthStateChanged`: before `loadUserData`, `POST /api/auth/session` then `currentUser.getIdToken(true)`.
  - `signInWithCredentials` → `POST /api/auth/credential-login`; on ok `signInWithCustomToken(auth, token)`; keep existing return shape and state setting (org/member from response; master → `fetchAllOrganizations()` + selector). Delete `ACCEPTED_MASTER_PASSWORDS`, synthetic users and all `passwordHash` reads/writes.
  - `setupFirstAccessPassword` and the inline first-access flow → show message "Peça ao administrador o seu link de primeiro acesso." (no password setting without link).
  - `changeUserPassword` / `adminSetUserPassword` → `POST /api/auth/set-password`.
- [ ] **Step 6:** `StructureModule.tsx:374` and `MasterCompanySelectorPage.tsx:238`: create member without `passwordHash`, then if a password was typed call `/api/auth/set-password`; add button "Gerar link de primeiro acesso" per member without password → `POST /api/auth/first-access/link`, shows copy + `wa.me` share (same pattern as `RhOnboardingManager.tsx:166-177`). After any member create/role change/deactivate in these screens, call `POST /api/auth/refresh-claims/:memberId`.
- [ ] **Step 7:** `FirstAccessPage.tsx` (rendered by `App.tsx` when `?primeiro-acesso=` present, like `?admissao=`): check token → form (new password ×2, min 6) → complete → `signInWithCustomToken` → reload to `/`.
- [ ] **Step 8:** `npm run lint`; manual against emulators (`firebase emulators:start` + `npm run dev` with emulator env): Google login, password login, **reload stays logged in**, master login, first-access link flow, admin sets password.
- [ ] **Step 9:** Commit `feat: client auth via server tokens and first-access link`.

### Task 8: Collection inventory and Firestore rules

**Files:**
- Create: `docs/firestore-collections.md`, `tests/emulator/rules.test.ts`
- Modify: `firestore.rules` (full rewrite), `src/modules/AiAssistantModule.tsx:70-71` (query `orgId`, the field actually written)

**Interfaces:**
- Consumes: claims shape (Global Constraints).

- [ ] **Step 1:** Inventory: for each collection in `grep -rhoE "collection\(db, *'[a-z_]+'" src` (56), record in `docs/firestore-collections.md` the owner field written by its `addDoc/setDoc` (`orgId` | `organizationId` | doc id | none) and special needs. Any collection with "none": either derive owner (document it) or add `orgId` at the write site (minimal edit).
- [ ] **Step 2: Failing rules tests** (`@firebase/rules-unit-testing`, emulator): for a representative collection of each owner kind — `unauthenticated denied`, `other org denied`, `member read/write allowed`, `organizationId-only docs readable by member`, `master allowed`, `update cannot change owner`; plus `member_credentials always denied`, `first_access_tokens always denied`, `org_members: member reads own org`, `org_members: self update limited to userId/userName/updatedAt/lastLoginAt`, `org_members: passwordHash field write denied`, `order_events/stock_movements/audit_logs not updatable`, `unlisted collection denied`, `organizations readable by any signed-in user, writable by master/Admin`.
- [ ] **Step 3:** `npm run test:emulator` → FAIL. **Step 4:** rewrite `firestore.rules` with `isMaster()`, `orgOf(d)`, `isMemberOf(org)`, `canAccess(d)` helpers and per-collection matches from the inventory; no `if true`, no catch-all. **Step 5:** → PASS.
- [ ] **Step 6:** Manual smoke against emulator with the app: open every module once as a normal member; console shows no `permission-denied`. List any that do and fix before commit.
- [ ] **Step 7:** Commit `feat: org-scoped firestore rules`.

### Task 9: Credentials guide and go-live gate

**Files:**
- Create: `docs/hospedagem-credenciais.md`

- [ ] **Step 1:** Write the guide in Portuguese for a non-developer: open console.cloud.google.com with the same Google account as AI Studio, select `gen-lang-client-0444631531`; grant the runtime service account `Cloud Datastore User`, `Storage Object Admin`, `Firebase Authentication Admin`, `Service Account Token Creator`; or create a key and paste it as AI Studio secret `FIREBASE_SERVICE_ACCOUNT`; set `MASTER_EMAILS`, `WEBHOOK_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `OWNER_PHONE`, `AUTHORIZED_PHONES`; deploy rules (`firebase deploy --only firestore:rules` or console paste); max instances = 1; run `npm run migrate:passwords` optional; how to read `/api/health` diagnostics.
- [ ] **Step 2:** Add script `"migrate:passwords": "tsx server/scripts/migratePasswords.ts"` that applies Task 4 migration to all members with plaintext `passwordHash` and prints counts (no passwords printed). Test `migrate script migrates all plaintext members` (emulator).
- [ ] **Step 3:** Gate: merge to `main` and deploy rules **only after** the owner confirms `/api/health` diagnostics all `true` on the real host. Record result in the guide.
- [ ] **Step 4:** Commit `docs: credentials guide and password migration script`.

### Task 10: Git hygiene and history rewrite (coordinated)

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1:** Add to `.gitignore`: `data_*.json`, `data_whatsapp_auth/`, `data_nd_pdfs/`, `.whatsapp_auth/`. `git rm -r --cached` those paths. Commit `chore: stop tracking server state`. **Only after** Task 9 gate confirmed the bucket holds the state.
- [ ] **Step 2 (owner present):** owner pauses AI Studio edits. `git clone --mirror` backup to scratchpad; `git filter-repo --invert-paths --path-glob 'data_*.json' --path data_whatsapp_auth --path data_nd_pdfs --path .whatsapp_auth`; verify `git log --all -- data_whatsapp_auth` is empty; force-push all branches with explicit owner OK in chat.
- [ ] **Step 3:** Owner re-syncs AI Studio from GitHub, unlinks the old device in WhatsApp, scans the QR once; confirm `server-state/data_whatsapp_auth/creds.json` updated in the bucket.
