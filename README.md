# Lurambi Campaign Field Platform

Vite + React + TypeScript single-page application backed by Supabase Auth and database RPCs. Phase 2 adds login, mobilizer registration and approval, and persisted mobilizer capture/list/link flows. The remaining import, public join, admin operations, and dashboard screens are not complete; do not collect real supporter data yet.

## Requirements

- Node.js 22 or later and npm
- Supabase CLI and Docker for a local database

## Local development

```sh
npm ci
cp .env.example .env.local
npm run dev
```

The app reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from `.env.local`. `VITE_TURNSTILE_SITE_KEY` is reserved for the future public forms. Server-only variables for those Vercel functions are `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `TURNSTILE_SECRET_KEY`. The browser only uses the URL and anon key; never put server-only values in a `VITE_*` variable or commit a populated environment file.

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

Vercel serves the Vite SPA from `dist/`; `vercel.json` rewrites browser routes to `index.html` and sets security headers. Public `/api` functions will be added in a later phase for join and data-subject requests.

## Data handling and compliance

- Use only synthetic fixtures in development and tests.
- Do not put personal data in source, fixtures, screenshots, logs, or issue reports.
- National IDs are HMAC-hashed and encrypted inside database functions with keys held only in `private.app_secrets`.
- Before production use, complete the campaign's data-protection obligations, including ODPC registration where required, approved consent and privacy wording, retention rules, a data-subject request process, and opt-in before bulk outreach.
- Real supporter data may only be loaded after the authorization, consent, persistence, and field workflows are implemented and reviewed.

## Phase status

Phase 1 establishes the schema, RLS, audit protection, ID protection, and core SECURITY DEFINER RPCs. Phase 2 connects Auth, role routing, mobilizer capture/search/list/referral, and mobilizer approval to Supabase. Admin flag review, verification, imports/exports, public forms, and analytics remain for later phases. Database migrations and role flows still need runtime verification against a local or dedicated TEST Supabase project before real supporter data is used.
