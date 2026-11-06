# Lurambi Campaign Field Platform

Vite + React + TypeScript single-page application. It currently contains the field workflow prototype and normalization utilities. Supabase persistence, authentication and role enforcement are being implemented in phases; do not use this prototype to collect real supporter data.

## Requirements

- Node.js 22 or later
- npm
- A Supabase project is not needed to run the current prototype. Do not connect it to production data.

## Local development

```sh
npm ci
cp .env.example .env.local
npm run dev
```

The current UI does not read environment variables or connect to Supabase. The example file documents the agreed configuration contract for the later integration: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_TURNSTILE_SITE_KEY` are browser-visible; `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `TURNSTILE_SECRET_KEY` are server-only Vercel function settings. Never put server-only values in a `VITE_*` variable or commit a populated environment file.

## Checks

```sh
npm run lint
npm test
npm run build
```

The build output is `dist/`. `npm run preview` serves that output locally.

## Supabase and Vercel

The database foundation and authenticated data flows are not available in this phase. Do not apply the current prototype schema to a production project. Later phases will add versioned migrations, a synthetic seed, RPC access, and setup instructions for a separate test project.

Vercel serves the Vite SPA from `dist/`; `vercel.json` rewrites browser routes to `index.html` and sets response security headers. Public `/api` functions will be added only for the public join and data-subject request flows. Configure their server-only secrets in Vercel project settings after those functions exist.

## Data handling

- Only use synthetic fixtures in development and tests.
- Do not put personal data in source, fixtures, screenshots, logs, or issue reports.
- National ID validation and masking are client-side presentation helpers only. ID hashing and encryption belong in database functions in the later backend phase.
- Real supporter data may only be loaded after the security, authorization, consent, and persistence phases have been completed and reviewed.

## Compliance checklist

Before production use, the campaign must complete its data-protection obligations, including registration with the Office of the Data Protection Commissioner where required, approved consent and privacy wording, a retention policy, a data-subject request process, and opt-in before any bulk outreach. This prototype does not enforce those obligations.

## Phase 0 status

Phase 0 removes browser-side ID hashing, replaces contact seed fixtures with synthetic records, adds normalization tests, documents the agreed environment variable names, and configures Vercel SPA/security headers. Database, authentication, public forms, and production workflows remain future phase work.
