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
