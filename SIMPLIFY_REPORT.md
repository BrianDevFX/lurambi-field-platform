# Simplification report

## Inventory before cleanup

This inventory describes the checked-out repository before removals. It is a Vite + React SPA, not the Next.js + Supabase application described in the task. It has no URL-routed pages, API routes, authentication flow, Supabase client, or database-backed data loading. Several visible screens are explicitly demos/simulations. Keep decisions below mean retained pending a human decision where runtime behavior or core-workflow replacement is uncertain.

### Routes and pages

There are no Next.js/React Router routes or URL-backed pages. The following single-page sections are selected with in-memory tabs:

| SPA page/section | Decision | Reason |
|---|---|---|
| `architecture` — `ArchitectureView` | REMOVE | In-app architecture notes and folder tree are documentation. |
| `supabase_sql` — `SqlSchemaView` | REMOVE | In-app schema/RLS viewer is setup documentation. SQL files remain untouched. |
| `importer_wizard` — `ImportWizard` | KEEP | Import and legacy-data cleaning are required; remove only synthetic-data/demo controls. |
| `verification_logic` — `VerificationLogicView` | KEEP | Verification and to-verify export are required; interactive parts need a human decision because they use local sample data. |
| `mobilizer_capture` — `MobilizerDashboard` | KEEP | Capture, list, referral, and offline entry points map to core workflows; implementation is currently simulated. |
| `admin_panel` — `AdminDashboard` | KEEP | Flag review, approvals, contacts, mapping, and audit views map to core admin workflows; implementation is currently simulated. |
| `analytics_dashboard` — `AnalyticsDashboard` | KEEP | Dashboard/export functionality is requested; projection and leaderboard extras are removable. Data source is currently in-memory. |
| `documentation` — `DocumentationView` | REMOVE | In-app setup, README, compliance, and test-plan viewer belongs outside the running app. |
| `hierarchy_seed` — `DataHierarchyView` | REMOVE | In-app hard-coded ward/centre/station and seed panel violates database-only data and is not an operational place editor. |
| Public privacy notice / public join URL | NEEDS HUMAN DECISION | No real public route exists; referral UI only opens a local preview modal with hard-coded form values. Build a real route only after the app's actual platform/auth/data architecture is resolved. |

### Navigation items before cleanup

| Navigation item | Location | Decision | Reason |
|---|---|---|---|
| Stage 1: Architecture | Header | REMOVE | Build-process documentation. |
| Stage 2: Supabase SQL | Header | REMOVE | In-app setup/schema viewer. |
| Stage 3: Import Wizard | Header | KEEP (rename Import/Export) | Required import, with the demo generator removed. |
| Stage 4: Duplicates & Verification | Header | KEEP (rename Verification) | Verification is core; demo/simulator behavior requires a human decision. |
| Stage 5: Field Capture & PWA | Header | KEEP (role-specific) | Capture is core; offline/PWA implementation requires a human decision. |
| Stage 6: Admin & Flags | Header | KEEP (role-specific) | Admin and flag review are core. |
| Stage 7: Analytics & Reports | Header | KEEP (rename Dashboard) | Keep requested dashboard essentials and exports; projection extras removable. |
| Stage 8: Production Docs & KDPA | Header | REMOVE | Documentation viewer; functional compliance UI is not demonstrated in this app. |
| 6 Wards & Seeds | Header | REMOVE | Hard-coded seed/place viewer. |
| Simulate Role: Admin / Coordinator / Mobilizer | Header | NEEDS HUMAN DECISION | A client-side role switcher is not authentication and cannot safely represent the required roles. Do not treat it as access control. |
| Flag Review Queue | AdminDashboard | KEEP | Required flag review queue; currently local demo state. |
| User Approvals | AdminDashboard | KEEP | Mobilizer registration/approval is required; currently no backend is connected. |
| Pastors & CHPs | AdminDashboard | KEEP | Network contacts are in requested scope; currently hard-coded local records. |
| Needs Mapping | AdminDashboard | KEEP | Unmapped-place handling is required; current queue is simulated. |
| Audit Log Viewer | AdminDashboard | KEEP | Audit log is required; current component contains hard-coded sample logs. |
| Capture Voter | MobilizerDashboard | KEEP | Required capture path. |
| My List | MobilizerDashboard | KEEP | Required mobilizer list. |
| Referral QR & Link | MobilizerDashboard | KEEP | Required referral link and QR; public join preview is not a real page. |
| PWA Offline Queue | MobilizerDashboard | NEEDS HUMAN DECISION | IndexedDB queue exists locally, but no working server sync/PWA integration was found. |
| Projection / turnout model | AnalyticsDashboard card | REMOVE | Explicitly excluded election projection model. |
| Mobilizer leaderboard | ReferralView card | REMOVE | Explicitly excluded decorative leaderboard. |

### API routes

| API route | Decision | Reason |
|---|---|---|
| None | — | No `app/api`, `pages/api`, server handlers, or `src` API endpoints exist. `express` is installed but unused. |

### Components

| Component | Decision | Reason |
|---|---|---|
| `src/components/Header.tsx` | KEEP / simplify | Current sole navigation shell; remove stage and simulated-completion labels. |
| `src/components/ArchitectureView.tsx` | REMOVE | In-app architecture documentation. |
| `src/components/SqlSchemaView.tsx` | REMOVE | In-app SQL/setup documentation; leave SQL files unchanged. |
| `src/components/DataHierarchyView.tsx` | REMOVE | Hard-coded ward/centre/station seed display. |
| `src/components/docs/DocumentationView.tsx` | REMOVE | Setup, README, compliance, and test-plan viewer. |
| `src/components/importer/ImportWizard.tsx` | KEEP / simplify | Required import wizard; remove synthetic workbook generator and embedded test/demo actions. |
| `src/components/verification/VerificationLogicView.tsx` | KEEP / review | Required verification and export; sample records/provider simulator are not connected to a database. |
| `src/components/mobilizer/MobilizerDashboard.tsx` | KEEP / review | Required mobilizer navigation; current data is in-memory. |
| `src/components/capture/CaptureWizard.tsx` | KEEP / review | Required capture and consent surface; currently local-only. |
| `src/components/referral/ReferralView.tsx` | KEEP / simplify | Required QR/referral surface; remove leaderboard; public join is only a local preview and synthetic form submission. |
| `src/components/offline/OfflineQueueView.tsx` | NEEDS HUMAN DECISION | Local IndexedDB inspector exists, but usable PWA/offline sync is not established. |
| `src/components/admin/AdminDashboard.tsx` | KEEP / review | Required admin entry point; uses local state. |
| `src/components/admin/FlagReviewQueue.tsx` | KEEP / review | Required flags; sample/local data only. |
| `src/components/admin/NeedsMappingQueue.tsx` | KEEP / review | Required unmapped-place handling; sample/local data only. |
| `src/components/admin/NetworkContactsManager.tsx` | KEEP / review | Required if working; currently uses hard-coded records. |
| `src/components/admin/UserManagementView.tsx` | KEEP / review | Required approval workflow; currently simulated. |
| `src/components/admin/AuditLogViewer.tsx` | KEEP / review | Required audit trail; currently hard-coded records. |
| `src/components/analytics/AnalyticsDashboard.tsx` | KEEP / simplify | Required dashboard; remove projection card and keep only requested metrics/filters/Excel export where implemented. |
| `src/components/analytics/ProjectionModelCard.tsx` | REMOVE | Explicitly excluded projection model. |

### Dependencies

| Dependency | Type | Decision | Reason |
|---|---|---|---|
| `@google/genai` | dependency | REMOVE | No imports; AI helper is out of scope. |
| `@tailwindcss/vite` | dependency | KEEP | Used by the actual Vite build configuration. |
| `@vitejs/plugin-react` | dependency | KEEP | Used by the actual Vite build configuration. |
| `dotenv` | dependency | REMOVE | No imports or server usage found. |
| `express` | dependency | REMOVE | No server/API route uses it. |
| `fuse.js` | dependency | REMOVE | No imports; matching uses local trigram helpers. |
| `jspdf` | dependency | KEEP | Used by the requested PDF exporter. |
| `jspdf-autotable` | dependency | KEEP | Used by the requested PDF exporter. |
| `lucide-react` | dependency | KEEP | Icons imported throughout retained app. |
| `motion` | dependency | REMOVE | No imports found. |
| `qrcode` | dependency | KEEP | Used for the referral QR code. |
| `react` | dependency | KEEP | Application runtime. |
| `react-dom` | dependency | KEEP | Application runtime. |
| `recharts` | dependency | KEEP / review | Used by dashboard charts; needed unless charts are removed after dashboard scope review. |
| `vite` | dependency | KEEP / needs human decision | Required by this repository's actual scripts/config. Removing it without migrating the app to Next.js would make it unbuildable. |
| `xlsx` | dependency | KEEP | Used by import, to-verify, and Excel exports. |
| `zod` | dependency | REMOVE | No imports found. |
| `@types/express` | devDependency | REMOVE | Express is unused. |
| `@types/node` | devDependency | KEEP | Vite config and Node toolchain types. |
| `@types/qrcode` | devDependency | KEEP | Types for QR package. |
| `@types/react` | devDependency | KEEP | React types. |
| `@types/react-dom` | devDependency | KEEP | React DOM types. |
| `autoprefixer` | devDependency | REMOVE | No imports/config usage; Tailwind v4 build works without it. |
| `esbuild` | devDependency | REMOVE | No direct usage; Vite 8/Rolldown works without a direct dependency. |
| `tailwindcss` | devDependency | KEEP | App styling/build. |
| `tsx` | devDependency | REMOVE | No imports or scripts use it. |
| `typescript` | devDependency | KEEP | Typecheck/lint and build. |

## Needs human decision

1. **Platform identity mismatch:** repository contains a Vite SPA rather than the specified Next.js/Supabase app. There are no auth, roles, server/API routes, database clients, environment variable usages, or public route architecture to preserve. A Next.js migration or restoring the intended app is larger than a cleanup and must not be improvised here.
2. **Core workflows are simulations:** capture, approval, flag review, mapping, audit, contacts, import commit, and dashboard data use local state or hard-coded sample/canonical records. Keeping their screens does not make them production workflows. Database-only locations and role enforcement cannot be completed without the missing backend.
3. **Public compliance pages:** there is no public Privacy Notice or data-subject request route; the referral join is a modal mock. Retain/refactor it only as a UI shell until real route and persistence behavior is established.
4. **PWA/offline queue:** IndexedDB helpers exist, but no service worker/manifest or server synchronization path was found. Do not describe it as working offline sync.
5. **Vite setup:** although Vite-specific leftovers are prohibited by the task, Vite currently is the only build system. Removing it would break `npm run build`; migration to Next.js is unresolved.
6. **Hard-coded hierarchy data:** `src/data/canonicalData.ts` feeds core matchers and capture/dashboard/admin screens. Remove only after database-backed replacements exist; otherwise core workflows would be weakened.
7. **Import persistence and fixed success screen:** the import wizard computes a local dry run, then simulates progress and displays a hard-coded successful database receipt. There is no database client or commit API in this repository. It remains a known core-flow defect pending the intended backend.

## Removed files

- `src/components/ArchitectureView.tsx` — in-app architecture and folder-tree viewer.
- `src/components/SqlSchemaView.tsx` — in-app SQL/setup viewer; `supabase/*.sql` were not changed.
- `src/components/DataHierarchyView.tsx` — hard-coded ward/centre/station seed panel.
- `src/components/docs/DocumentationView.tsx` — in-app setup, README, compliance, and test-plan viewer.
- Five hard-coded synthetic/demo entries were removed from `src/App.tsx`; the app now starts with an empty in-memory list instead of fabricated voter records.
- `src/components/analytics/ProjectionModelCard.tsx` — excluded turnout/victory projection model.
- `src/lib/synthetic/legacyWorkbookData.ts` — removed the fake workbook generator; the workbook row type now lives in `src/types/index.ts`.
- Import UI no longer loads a generated synthetic workbook.
- `src/components/referral/ReferralView.tsx` no longer renders the fabricated mobilizer leaderboard.
- `metadata.json` — unused AI Studio manifest.
- `bun.lock` — duplicate lockfile for an unused package manager; npm's `package-lock.json` remains authoritative.
- `vite.config.ts` — removed the AI Studio `DISABLE_HMR` branch and unused path alias; retained the Vite plugins needed by this repo.
- `index.html` no longer downloads unused Google font families.

Cleanup group verification: `npm run lint` passed. `npm run build` passed (run with elevated permission after Tailwind's native binding hit sandbox `EPERM`); Vite reports a 1.71 MB minified main JS chunk.

## Removed dependencies and size

Removed after import searches confirmed no source/config usage: `@google/genai` (11.62 MB), `dotenv` (0.10 MB), `express` (0.21 MB), `fuse.js` (0.40 MB), `motion` (0.65 MB), `zod` (5.86 MB), `@types/express` (0.01 MB), `autoprefixer` (0.20 MB), `tsx` (0.38 MB), and direct `esbuild` (0.14 MB). Direct installed package folders totaled approximately **19.57 MB** before removal. npm reported 138 package entries removed across uninstall commands; `npm prune` completed.

Verification after this group: `npm run lint` passed; `npm run build` passed. Production main JS remains about 1.71 MB minified (523 KB gzip), so charting/export libraries still dominate the bundle.

## Smoke-test checklist

Run against a configured deployment with safe synthetic data:

- [ ] Login as Admin; confirm admin-only navigation and permissions.
- [ ] Login as Ward Coordinator; confirm ward-scoped, read-only entries and mobilizer list.
- [ ] Login as Mobilizer; create an entry with consent and confirm it appears in My List.
- [ ] Submit the same supporter again; confirm duplicate submission is blocked.
- [ ] Confirm a Mobilizer cannot edit or delete through both the UI and a direct API/database request.
- [ ] As Admin, edit an entry with a mandatory reason; confirm the audit log records it.
- [ ] Run import dry run and commit with a synthetic workbook; review the import report.
- [ ] Export Excel and PDF; inspect fields and masking.
- [ ] Open the referral page at phone width; verify QR/link and public join flow.
- [ ] Open the Privacy Notice and data-subject request page; verify both load.
- [ ] Capture a supporter and verify consent checkbox and timestamp are stored.
- [ ] If offline support is retained, test capture, refresh persistence, reconnect, and sync.

This checklist is a handoff plan, not evidence that the current repository supports these flows.
