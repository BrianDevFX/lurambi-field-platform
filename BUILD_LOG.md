# Build log

## Phase 0 — Hygiene and safety

Branch: `build/phase-0`, created from `simplify` at `439f2d1`. Git history was rewritten locally after the user authorized the HUMAN STEPS; commit IDs changed. No database was connected. The only DB-related work is static file cleanup; no SQL was executed.

### Changes

- Removed the deterministic ID salt and all ID hash generation from `src/lib/normalisation/nationalId.ts`. The helper now validates 7/8-digit format and returns a masked ID only. Removed hash/raw-ID fields from capture and IndexedDB queue payloads, and removed the referral modal's synthetic hash value. Import preview dedupe is limited to temporary name/ward keys; authoritative ID matching is reserved for DB functions.
- Removed raw-ID matching and masked-ID reconstruction from local verification stubs (`src/lib/verification/*`, `src/components/verification/VerificationLogicView.tsx`); they now use only existing hash values until the database-backed verification flow is implemented.
- Removed the potentially real contact rows from the working copies of `supabase/seed.sql` and `supabase/repair_and_seed.sql`, replacing each contact type with 10 clearly synthetic records, null phone numbers, and an explicit synthetic-only note. Removed record blocks (original line numbers before this change; contents intentionally omitted): `supabase/seed.sql:123-129,132-137`; `supabase/repair_and_seed.sql:986-992,995-1000`.
- Removed the sample supporter row from the spreadsheet template. Updated test fixtures/placeholders/comments to use synthetic names and masked format examples.
- Added `vitest`, `npm test`, and 17 normalization tests for phone formats, ID validation/masking, specified ward aliases/case/whitespace, junk place values and specified place aliases, plus support-level normalization.
- Updated `.env.example` to contain only the three agreed browser variables and three server-only function variables, all blank. Removed the obsolete `ID_HASH_SALT` line from ignored `.env.local` without displaying or copying its value.
- Added `/data/` and `*.xlsx` to `.gitignore`; replaced inaccurate README claims with current Vite/Supabase/Vercel status and setup notes; added `vercel.json` SPA rewrite and security headers.
- Updated `src/lib/normalisation/normalisation.test.ts` and phone examples; removed the example supporter row from `src/lib/reports/excelExport.ts`. Updated `src/lib/duplicate/duplicateDetector.ts`, `src/lib/normalisation/importerCore.ts`, and `src/lib/normalisation/supportLevel.ts` to remove client-hash assumptions and name-like fixture examples.
- No package upgrades were requested or performed. `npm install --save-dev vitest` added the test runner; install reported 0 vulnerabilities.

### Historical purge

After approval, `git-filter-repo` 2.47.0 was installed in a temporary workspace folder and run locally. It removed these complete file paths from all local refs, repacked/cleaned the repository, and removed the `origin` remote automatically. The sanitized Phase 0 files were then restored from a backup outside the repository and recommitted. A targeted history check now shows those paths only in this post-purge commit; the earlier file versions are absent from local refs. No remote push was performed.

The equivalent filter command was:

```sh
py .phase0-tool\git_filter_repo.py --force --path src/lib/normalisation/nationalId.ts --path supabase/seed.sql --path supabase/repair_and_seed.sql --invert-paths
```

### Checks

| Command | Result |
|---|---|
| `npm run lint` | PASS — `tsc --noEmit`, exit 0. |
| `npm test` | PASS — 1 file, 17 tests passed. |
| `npm run build` | PASS — Vite production build completed. Existing large-chunk warning remains: main JS 1,679.19 KB minified / 514.88 KB gzip. |
| Vercel config parse | PASS — JSON parsed; one SPA rewrite and one header group. |
| `git diff --check` | PASS — whitespace check clean; Git emitted only configured LF-to-CRLF notices. |

The lint, test, and build checks were repeated after the local history rewrite and file restoration; all results remained PASS (17 tests).

### Known gaps

- Authentication, Supabase client/RPC persistence, migrations, RLS, server-side ID protection, and live capture are not implemented in Phase 0. The current UI remains a prototype and must not collect real supporter data.
- The VITE/Supabase/Turnstile variables are documented but not read by the current app; the server-only variables are not used until Vercel functions are added.
- The Vercel headers have not been checked on a deployed preview. No local Supabase or test project was used; no TEST credentials were supplied.
- `supabase/repair_and_seed.sql` remains temporarily; Phase 1 must fold its valid schema fixes into migrations and delete the duplicate file as specified.
- The rewritten local history does not include the sensitive file paths. The remote has not been force-updated; the remote may still contain the old history. `origin` was removed by the utility and has not been re-added.

## HUMAN STEPS

- Before sharing/pushing, coordinate whether to re-add the `origin` remote and force-push rewritten refs so the remote no longer retains the old history. No remote was contacted or changed by this task.
- No secrets or database credentials are needed for Phase 0 checks. Do not load production data. For Phase 1+, start local Supabase or provide the isolated TEST project credentials in an untracked `.env.test`; insert the HMAC/encryption secrets into the private DB schema through the SQL editor when the migration is ready.
- After the public API functions exist, configure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `TURNSTILE_SECRET_KEY` only in Vercel's server-side environment settings. Configure the public VITE values separately. None are consumed in this phase.
- No test accounts were created; Phase 1 will need synthetic admin, coordinator, approved mobilizer, and pending mobilizer accounts.

## Phase 1 — Database and security core

Branch: `build/phase-1`, created from the Phase 0 branch. No database was connected or modified. The Supabase CLI and `.env.test` are unavailable in this workspace, so migration execution and database runtime checks are NOT VERIFIED.

### Changes

- Added Supabase local configuration, four ordered migrations, and the RLS report query in `supabase/checks/rls_report.sql`. The migrations define core tables/enums/indexes, `private.app_secrets`, RLS on every public table, minimal authenticated read grants, admin-only audit/export visibility, and checked SECURITY DEFINER RPCs for capture/search, approval, admin edits/merges/reassignment, flags, verification, ID reveal, export logging, imports, and service-role public join.
- Added ID HMAC-SHA256, pgcrypto encryption, masked ID helpers, Kenyan phone normalization, audit append-only trigger, hashed search rate limiting, duplicate blocking/logging, informational shared-phone flags, and place alias handling.
- Signup creates a pending mobilizer profile from non-sensitive Auth metadata. The raw national ID is submitted separately through `complete_mobilizer_registration`; it is never put in Auth metadata by the intended client flow. The RPC stores only the masked, HMAC, and encrypted forms.
- Updated `supabase/seed.sql` to six wards, known aliases, clearly synthetic centres/stations and contacts, and safe defaults with capture consent disabled until approved wording/version is configured.
- Added placeholder-only SQL for private key insertion and initial admin bootstrap. Removed the obsolete `supabase/repair_and_seed.sql` and one-file `supabase/schema.sql`; migrations are the schema source of truth.
- Added optional isolated-project RLS integration tests under `tests/rls/rls.test.js`; the suite skips when `.env.test` and its synthetic test fixtures are not configured. Added Supabase client dependency for the future browser RPC integration.
- Updated README setup notes for the actual Vite/Supabase/Vercel stack and Phase 1 limits.

### Checks

| Command | Result |
|---|---|
| `npm run lint` | PASS — `tsc --noEmit`, exit 0. |
| `npm test` | PASS — 1 normalization file, 17 tests passed; 1 RLS integration file skipped, 10 tests skipped because no isolated TEST project/fixtures are configured. |
| `npm run build` | PASS — Vite production build completed. Existing large-chunk warning remains: main JS 1,679.19 KB minified / 514.88 KB gzip. |
| `supabase db reset` / migration replay | NOT VERIFIED — Supabase CLI is not installed; no database credentials were available. No production connection was attempted. |
| `git diff --check` | PASS — whitespace check clean; Git emitted only configured LF-to-CRLF notices. |

### Known gaps

- Database SQL has not been executed against a local or TEST Supabase instance. Treat migrations and RPC logic as unverified until replay and RLS tests pass in that isolated environment.
- No secrets were generated or inserted. A human must configure `id_hmac_secret` and `id_encryption_key` in `private.app_secrets` before national-ID registration, matching, or ID-bearing imports work.
- Consent is intentionally disabled by seed default. An administrator must configure approved wording and its version before capture works.
- The frontend remains prototype/local-state UI. It does not yet call Supabase Auth/RPCs; those flows are Phase 2.
- RLS tests require synthetic users in five roles plus fixture entry/audit IDs and consent settings in a disposable database. They were not run against a live DB.
- The main production JS bundle still exceeds 400 KB gzip; performance splitting is scheduled for Phase 7.

## HUMAN STEPS

- Use a local Supabase instance (`supabase start`, `supabase db reset`) or a dedicated TEST project only. Do not run the migrations on production during this phase.
- In the SQL editor for that isolated database, run `supabase/setup_secrets.example.sql` after replacing both placeholders with separately generated random values of at least 32 characters. Do not put values in this repo or an env file.
- Create the first Auth account using a placeholder-safe test email, then run `supabase/bootstrap_admin.example.sql` with that exact email. Create synthetic coordinator, approved mobilizer A, approved mobilizer B, and pending mobilizer test accounts; configure consent wording/version and synthetic places.
- To execute RLS integration tests, place isolated TEST connection values and test account/fixture values in untracked `.env.test` using the `TEST_*` names documented at the top of `tests/rls/rls.test.js`. The test batch writes synthetic rows to that disposable database.
- Review the migration SQL and run `supabase/checks/rls_report.sql` in the isolated SQL editor. No deploy, push, or merge has been performed.

## Phase 2 — Auth and mobilizer workflow

Branch: `build/phase-2`, created from Phase 1. The app was not connected to Supabase because no local Supabase CLI/runtime or isolated TEST credentials are available. Runtime auth, RPC, and persistence checks are NOT VERIFIED; no production database was contacted.

### Changes

- Added a browser Supabase client that reads only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Login supports normalized Kenyan phone pseudo-email addresses and a real email path for administrators. Registration uses DB-sourced ward options, creates a pending mobilizer, and submits National ID separately through `complete_mobilizer_registration`, never as Auth metadata.
- Added session restore, profile lookup with safe column selection, role/status routing, pending/suspended screens, and sign-out after 30 minutes without activity.
- Connected admin and coordinator mobilizer lists to RLS-protected profiles and approval to `approve_mobilizer`; admin suspension calls `suspend_mobilizer`. Both actions require a reason and are audited by the database RPC.
- Replaced the active mobilizer prototype with four tabs: Search/Add, My List, My Link, Profile. Capture reads wards/centres/stations and consent policy from Supabase, searches via RPC, submits via `submit_entry`, and displays blocked duplicate details using masked IDs. My List selects only permitted columns and relies on RLS. My Link uses the stored referral code for a QR code and WhatsApp share. The simulated offline tab and unused mock analytics, verification, admin, navigation, and offline views were removed.
- Added `supabase/migrations/20261107100000_phase2_registration_and_search.sql` for pre-auth ward/station labels, server validation of home-station hierarchy, and full normalized phone search. Added phone-to-pseudo-email unit tests.
- Updated README for the current Phase 2 behavior and remaining gaps.

### Checks

| Command | Result |
|---|---|
| `npm run lint` | PASS — `tsc --noEmit`, exit 0. |
| `npm test` | PASS — 20 unit tests passed; 10 isolated RLS integration tests skipped without TEST credentials/fixtures. |
| `npm run build` | PASS — Vite production build completed: main JS 497.83 KB minified / 142.54 KB gzip; no chunk-size warning. |
| Live login/capture/approval/persistence | NOT VERIFIED — no local Supabase runtime or dedicated TEST credentials were supplied. |

### Known gaps

- The app is now database-backed but is not ready for real supporter data until the migrations are replayed and runtime RLS/Auth tests pass on a local or dedicated TEST database.
- Capture remains disabled until private ID secrets are inserted and an approved consent text/version is configured. The current Settings UI for that configuration is planned for Phase 4.
- Referral links are displayed and shareable, but the public `/join/:code` page arrives in Phase 5.
- Admin/Coordinator currently have mobilizer approval management only; flags, entries, verification, import/export, settings, audit views, and dashboard arrive in later phases.
- The prototype import wizard and normalisation fixtures remain for Phase 3 replacement; the active Phase 2 flows no longer read local mock records or store entries in browser state.

## HUMAN STEPS

- Apply all migrations through `20261107100000_phase2_registration_and_search.sql` and seed on a local Supabase instance or dedicated TEST project only. Supabase CLI/runtime and TEST credentials are not available in this workspace, so I could not run these steps.
- Configure `.env.local` with the isolated project URL and anon key, restart Vite, and insert the HMAC/encryption secrets in the private schema. Set the `consent_policy` setting with approved text, a version, and `enabled: true` before capture.
- Bootstrap the first admin, then create synthetic coordinator, approved mobilizer, and pending mobilizer accounts. Verify phone login, sign-up, approval, capture, duplicate blocking, cross-device persistence, own-entry visibility, referral QR, and idle timeout.
- Run the isolated RLS integration suite using its documented `.env.test` fixture names. Do not point it at production. No push or merge has been performed.

## Phase 3 — Real import

Branch: `build/phase-3`, based on `build/phase-2`. Phase commits: `859b734` (database import operations) and `a6a82c4` (admin import/contact UI). Nothing was pushed or merged. No local Supabase runtime or dedicated TEST credentials were available; no database was contacted.

### Changes

- Replaced the timer-based import prototype with XLSX/CSV validation (5 MB and 20,000-row limits), dynamic `xlsx` loading, header detection, editable per-sheet column mapping, 20-row previews, database dry run, 500-row commits, actual RPC-driven progress, and XLSX row reports. IDs are masked in the preview and omitted from the report. Exported report cells are neutralized for spreadsheet formula injection.
- Added admin tabs for mobilizer management, import/places, and network contacts. The contacts screen reads through limited selects and saves ward/station assignment, reach status, notes and CHP export exclusion via an audited RPC requiring a reason.
- Added migration `supabase/migrations/20261106150000_phase3_import_operations.sql`: audited alias and contact update RPCs, place batch import, row preview, legacy “not found” import status mapping, and minimal authenticated grants. Place rows are processed ward → centre → station; the first committed place batch removes only explicitly synthetic centres/stations.
- Added an admin “Needs mapping” workflow from unmapped preview rows. It lets an admin select canonical places, saves aliases through the audited RPC, and reruns preview.
- No new dependencies were added. Existing `npm test` includes 10 RLS integration cases that skip without TEST credentials.

### Checks

| Command | Result |
|---|---|
| `npm run lint` | PASS — `tsc --noEmit`, exit 0. |
| `npm test` | PASS — 20 passed; 10 RLS tests skipped because no isolated DB credentials/runtime are available. |
| `npm run build` | PASS — Vite production build completed. Main JS 518.68 KB minified / 147.93 KB gzip; dynamic XLSX chunk 491.99 KB / 160.33 KB gzip. Vite warns that a chunk exceeds 500 KB minified. |
| Database migration replay / import RPCs / synthetic workbook | NOT VERIFIED — no local/test database was available. |

### Known gaps

- The existing database dry-run branches validate and count rows but do not execute the complete insert/duplicate-trigger path in a rollback transaction. The preview is useful for mapping/format issues but cannot certify duplicate blocking or every commit-time outcome; rely on commit response/errors and test the migration on isolated Supabase before field use.
- Network-contact import maps polling-station labels against the database station names in the browser; repeated station names across wards may need manual review. The import summary/report is preview-derived and is not a server-generated row-by-row commit receipt.
- Synthetic place replacement drops references to synthetic centres/stations (foreign keys null those references). Apply and test with a disposable database first, then verify the official place list before importing real supporter data.
- No runtime check confirms role grants, RLS behavior, alias resolution, import idempotency, transaction behavior, or audit-log output for these new RPCs. No production database was used.
- Main bundle remains above Vite’s 500 KB warning threshold; performance splitting is scheduled for Phase 7.

## HUMAN STEPS

- Apply migrations through `20261106150000_phase3_import_operations.sql` and seed only a local Supabase instance or the dedicated TEST project. Insert the two private DB secrets as described in README; do not put them in env files.
- Use synthetic admin/coordinator/mobilizer accounts. Import a synthetic workbook with entries, duplicate rows, “not found”, contacts, and ward/centre/station sheets. Verify dry-run versus commit results, a second identical import, alias save/re-preview, CHP exclusion, contact update audit events, and replacement of synthetic places.
- Run the RLS suite and confirm the full synthetic import workflow before loading real records. No push, merge, or production DB access has occurred.

## Phase 4 — Admin operations and exports

Branch: `build/phase-4`, created from `build/phase-3`. Phase commits: `f3a4bfc` (audited database operations), `c0aeda9` (admin tools and scoped exports), and `50ef777` (settings and export wiring). Nothing was pushed or merged. No local Supabase or dedicated TEST database was available; no database was contacted.

### Changes

- Added admin entry editing through `admin_update_entry` with a required reason, mobilizer/ward reassignment through `admin_reassign_entry`, and flag resolve/dismiss/merge controls through `resolve_flag`. The UI uses safe entry selects with masked IDs; table updates/deletes remain RPC-only.
- Added a verification queue grouped by ward and centre, manual per-selection bulk status updates with evidence notes, a 500-row XLSX/CSV ID + status upload, and a downloadable masked “to verify” sheet. Bulk National IDs are sent only to the admin-only RPC, which hashes them inside Postgres and returns counts without returning IDs.
- Added an append-only audit viewer with action filtering and logged CSV export. Added audited settings updates for consent text/version, share-message template, issue categories, CHP note, manual verification enablement, and excluding unconfirmed legacy consent from outreach exports. Manual verification enablement is checked in both the UI and `set_verification`; automated register and external providers remain disabled.
- Added audited CRUD for wards, centres, stations and aliases. Deletes are blocked when records depend on the place; admins must reassign dependencies first. The prior import wizard remains the “Needs mapping” queue.
- Added a role-scoped export center for supporter records, flags, verification, ward/station summaries, mobilizer performance and eligible network contacts. Mobilizers can export their own entries from My List; coordinators see their ward through RLS. XLSX/CSV/PDF creation logs through `log_export`; exported cell text is neutralized against formula injection. Added logged import templates and import-report downloads.
- Updated the seed default so only manual verification is enabled until a database register workflow exists. No new dependencies were added.

### Checks

| Command | Result |
|---|---|
| `npm run lint` | PASS — `tsc --noEmit`, exit 0. |
| `npm test` | PASS — 20 passed; 10 RLS tests skipped without TEST credentials/runtime. |
| `npm run build` | PASS — Vite production build completed. Main JS 566.86 KB minified / 156.89 KB gzip; XLSX 491.99 KB / 160.33 KB gzip; jsPDF 399.67 KB / 129.90 KB gzip. Vite warns that the main and XLSX chunks exceed 500 KB minified. |
| `git diff --check` | PASS — no whitespace errors. Git only warned about its configured LF-to-CRLF conversion. |
| Migration replay, RLS, admin workflows, CSV formula test in Excel | NOT VERIFIED — no isolated database/browser test project was available. |

### Known gaps

- New migration SQL has not been replayed or exercised. Role checks and referential delete protections were reviewed statically only.
- Admin entry and flag queues show up to 500 rows; verification shows up to 1,000; the audit viewer shows up to 500. Export queries page through permitted entries but currently load all matching rows in browser memory.
- Automated register verification is not wired to the database; its setting is forcibly disabled. The external link provider remains disabled with no outbound request path.
- PDF/Excel exports and formula-injection neutralization were not opened in Excel or tested at runtime. Only masked IDs are selected for exports.
- The existing ten RLS integration tests still skip without a dedicated TEST database. No live role, audit, settings, merge, or export-log behavior has been confirmed.
- `PROGRESS_AUDIT.md` and `audit/` remain pre-existing untracked artifacts and were not modified or staged.

## HUMAN STEPS

- Apply `supabase/migrations/20261106160000_phase4_admin_operations.sql` and reseed only on local Supabase or the isolated TEST project. Verify the migration from an empty database and confirm the settings provider values show manual enabled, register import disabled, and external disabled.
- With synthetic accounts, verify admin edit/reassign/merge/delete protections and audit entries; coordinator read-only ward scoping; manual verification on/off; bulk ID upload results; alias/place CRUD; and export row counts under each role.
- Export synthetic cells beginning with `=`, `+`, `-`, `@`, tab and carriage return to XLSX, CSV and PDF, and confirm no formula executes in spreadsheet software. Confirm each export appears in `exports_log` and mobilizer/coordinator data stays within RLS scope.
- Run the RLS integration suite and deployed-preview smoke checks before using real records. No push, merge, or production database access has occurred.
