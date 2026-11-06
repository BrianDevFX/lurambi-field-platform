# Lurambi Campaign Field Platform

Vite + React + TypeScript single-page application backed by Supabase Auth and database RPCs. The app includes mobilizer login, registration and approval, persisted capture/list/referral flows, imports, admin operations, exports, public supporter registration, a Privacy Notice, and a data-subject request form. Database and deployed-runtime behavior still need verification in an isolated environment; do not use real supporter data until those checks pass.

## Requirements

- Node.js 22 or later and npm
- Supabase CLI and Docker for a local database

## Local development

```sh
npm ci
cp .env.example .env.local
npm run dev
```

The browser reads `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_TURNSTILE_SITE_KEY` from `.env.local`. Vercel API functions use `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `TURNSTILE_SECRET_KEY` server-side. The browser only uses the URL, anon key, and Turnstile site key; never put server-only values in a `VITE_*` variable or commit a populated environment file. Configure the matching Cloudflare Turnstile site and secret keys for local/preview hostnames.

## Local Supabase database

Start a local, synthetic-only project and apply the migrations and seed:

```sh
supabase start
supabase db reset
```

The migrations are in `supabase/migrations/`; the seed contains the six wards, aliases, synthetic places, and clearly fictional network-contact fixtures. Do not use production supporter data. After migrations, a human must insert independently generated ID HMAC and encryption secrets using the placeholder SQL in `supabase/setup_secrets.example.sql`, then bootstrap an initial administrator using `supabase/bootstrap_admin.example.sql`. Never populate and commit either example file. The browser must send raw IDs only to database RPCs over TLS; it must never hash or persist them.

The database auth trigger creates pending mobilizer profiles. Registration sends the national ID separately to `complete_mobilizer_registration`, not in Auth metadata. Mobilizers sign in using their Kenyan phone and password; the app maps the normalized phone to a deterministic pseudo-email for Supabase Auth. Admins can also sign in with their real email. Email confirmation is disabled in `supabase/config.toml` for the local auth service. Production Auth and database settings still require separate review before deployment.

## Checks

```sh
npm run lint
npm test
npm run build
```

`npm test` includes normalization unit tests and optional RLS integration tests. The latter run only when `.env.test` contains credentials and fixture IDs for an isolated local or TEST Supabase project. Never point them at production. RLS inventory queries are in `supabase/checks/rls_report.sql`.

Vercel serves the Vite SPA from `dist/`; `vercel.json` rewrites browser routes to `index.html` and sets security headers. `/api/join` serves the public referral form and `/api/dsr` accepts data-subject requests. Both require server-only Supabase and Turnstile configuration and use database-backed rate limits. Configure all six variables in Vercel with the correct browser/server scopes.

## Preview and production setup

1. Create a Supabase project and apply the versioned migrations in order. Use local Supabase or a dedicated TEST project until the smoke checks below pass; never run these checks against production data.
2. In the Supabase SQL editor, insert independently generated ID HMAC and encryption keys using the instructions in `supabase/setup_secrets.example.sql`. Bootstrap the first administrator using `supabase/bootstrap_admin.example.sql`, replacing its placeholder email with the approved account. Do not commit populated SQL or secret values.
3. Configure Vercel browser variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_TURNSTILE_SITE_KEY`. Configure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `TURNSTILE_SECRET_KEY` only as server-side Vercel variables. Add the preview/production hostnames to the Cloudflare Turnstile site configuration.
4. Set approved consent wording and version in the admin Settings screen, then deploy a preview and test with synthetic accounts and records. Do not use real supporter data until authorization, RLS, public forms, exports, offline sync, and security headers have been reviewed.

The installable PWA caches the application shell and static route chunks. Offline capture drafts use IndexedDB and contain no National ID. Drafts sync when the app is open and connectivity returns; each remains visible until the server confirms it was saved or blocked. The browser must remain signed in as the mobilizer who created the draft for sync to succeed.

## Data handling and compliance

- Use only synthetic fixtures in development and tests.
- Do not put personal data in source, fixtures, screenshots, logs, or issue reports.
- National IDs are HMAC-hashed and encrypted inside database functions with keys held only in `private.app_secrets`.
- Before production use, complete the campaign's data-protection obligations, including ODPC registration where required, approved consent and privacy wording, retention rules, a data-subject request process, and opt-in before bulk outreach.
- Real supporter data may only be loaded after the authorization, consent, persistence, and field workflows are implemented and reviewed.
- Confirm the campaign is registered with the Office of the Data Protection Commissioner as a data controller where required, and do not send bulk SMS without opt-in.

## Preview smoke checks

- Sign in with synthetic Admin, Ward Coordinator, and Mobilizer accounts; confirm each role sees only its permitted data.
- Capture an entry online and offline. Verify that a queued draft syncs once, duplicate submissions show `duplicate-blocked`, errors remain queued, and a Mobilizer still cannot edit or delete records.
- Verify admin edits include a reason and appear in the audit log; verify coordinator filters and exports remain ward-scoped.
- Test synthetic import dry run/commit, to-verify export, XLSX/CSV/PDF exports, public referral registration, consent, Turnstile, Privacy Notice, and DSR queue.
- Install the PWA, reopen it offline after a successful mobilizer sign-in, capture a pending-ID draft, reconnect, and confirm the server result before dismissing the queued result.
- Inspect the deployed preview for CSP, HSTS, content-type, frame, referrer, and permissions headers. Confirm no service-role key or National ID appears in browser bundles or IndexedDB.

## Phase status

Phases 1–7 add the schema/RLS and protected RPCs, authenticated role flows, import operations, admin review and exports, public join/privacy/DSR workflows, aggregate dashboards, PWA shell, offline draft queue, and code splitting. Migrations, RLS, role flows, imports, public forms, dashboard aggregates, offline sync, Turnstile, and audit behavior still need runtime verification against local or dedicated TEST Supabase before real supporter data is used. For public forms, set `settings.consent_policy` to an enabled policy with a version and consent text; optional `text_sw` provides the Kiswahili text.
