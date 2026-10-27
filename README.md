# Lurambi Campaign Field Platform (2027 General Election)

> **Mobile-First Field Intelligence, Voter Verification, and KDPA 2019-Compliant Campaign System**  
> **Constituency**: Lurambi (0220), Kakamega County, Kenya  
> **Target Office**: Member of Parliament, 2027 General Election  
> **Canonical 6 Wards**: Sheywe, Mahiakalo, Shirere, Butsotso East, Butsotso South, Butsotso Central  

---

## Table of Contents
1. [Executive Summary & Context](#1-executive-summary--context)
2. [Technical Stack](#2-technical-stack)
3. [Architecture & Project Structure](#3-architecture--project-structure)
4. [Local Development Setup](#4-local-development-setup)
5. [Supabase Database & Security Setup](#5-supabase-database--security-setup)
6. [Vercel Deployment Guide](#6-vercel-deployment-guide)
7. [Kenya Data Protection Act (KDPA 2019) Statutory Compliance](#7-kenya-data-protection-act-kdpa-2019-statutory-compliance)
8. [Comprehensive End-to-End Test Plan](#8-comprehensive-end-to-end-test-plan)
9. [Operational Handover & Campaign Runbook](#9-operational-handover--campaign-runbook)

---

## 1. Executive Summary & Context

The **Lurambi Campaign Field Platform** is an enterprise-grade, mobile-first field operations platform engineered for a parliamentary candidate in Lurambi Constituency (Kakamega County, Kenya) for the 2027 General Election.

### Core Problems Solved
1. **Spreadsheet Retirement & Data Hygiene**: The campaign previously operated with an unstructured Excel workbook of ~1,000 supporter rows plagued by missing National IDs (~86% missing), dropped leading zeros on phone numbers (`705961838` instead of `+254705961838`), shared family phones, ward typos ("Shieywe", "Mahialako"), junk polling station labels ("Approved", "Daisy", "uncle devi"), and first names ("Zainab", "Mildred") incorrectly written into support level columns. This platform ingests, cleanses, maps, and imports this data with full auditability.
2. **Strict Hierarchy**: Fixed 4-tier political hierarchy enforced throughout:  
   `Constituency (Lurambi) → Ward (6) → Polling Centre (129) → Polling Station (241)`
3. **Pluggable Voter Verification**: Designed for an unknown or delayed IEBC voter register data source. Features an extensible adapter pattern (`register_import`, `manual`, and `external_link` stub with zero web scraping) to verify voter eligibility while safeguarding against legal liabilities under the *Computer Misuse and Cybercrimes Act 2018*.
4. **Field Mobilizer Empowerment & RLS Lockdown**: Mobilizers capture supporters on 360px mobile viewports, even in zero-reception rural corners of Butsotso East or Central, via a native IndexedDB offline queue. Security is guaranteed via Supabase Postgres Row Level Security (RLS) where mobilizers can **only insert and read their own records**; `UPDATE` and `DELETE` privileges are strictly withheld at the database engine level.
5. **KDPA 2019 Legal Shield**: Full compliance with the *Kenya Data Protection Act 2019* and *Office of the Data Protection Commissioner (ODPC)* regulations, including salted SHA-256 ID hashing, UI masking (`2****789`), explicit opt-in consent records (`v1.2-2027`), public health promoter (CHP) export exclusions, and an immutable audit log.

---

## 2. Technical Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Frontend Framework** | React 19 / Next.js 14+ (App Router) | High-performance mobile rendering, modern hooks, server components capability |
| **Styling & UI** | Tailwind CSS v4, Lucide Icons | Mobile-first utility design (360px base), zero bloat, crisp icons |
| **Database & Auth** | Supabase (PostgreSQL 15+) | Rock-solid relational integrity, Row Level Security (RLS), GIN Trigram index (`pg_trgm`) |
| **Offline Storage** | Native IndexedDB (`idb`) | Browser-native offline queue, persists across mobile restarts, zero dependency overhead |
| **Data Parsing & Export** | SheetJS (`xlsx`), `jspdf`, `jspdf-autotable` | Client-side spreadsheet ingestion, multi-tab Excel export, executive PDF report generation |
| **Fuzzy Matching** | Postgres `pg_trgm` + `fuse.js` | Fast typo-tolerant matching for ward aliases and polling centre nicknames |
| **Data Validation** | Zod v3 | Strict runtime validation of phone numbers, national IDs, and submission payloads |
| **Visualisations** | Recharts v2 | Responsive SVG analytics: ward breakdowns, verification funnels, turnout projections |
| **QR Code Engine** | `qrcode` | Offline dynamic QR generation for mobilizer referral links |

---

## 3. Architecture & Project Structure

```
├── .env.example                     # Environment configuration blueprint
├── README.md                        # Master documentation, setup & test plan
├── index.html                       # HTML entry point with metadata & PWA tags
├── metadata.json                    # AI Studio manifest
├── package.json                     # NPM packages & build scripts
├── tsconfig.json                    # TypeScript compiler configuration
├── vite.config.ts                   # Build & alias configuration
├── supabase/
│   ├── schema.sql                   # Complete Postgres DDL: Tables, Enums, Indexes, RLS, Triggers
│   └── seed.sql                     # Canonical Lurambi 6 Wards, Centres, Stations, Aliases, Pastors, CHPs
└── src/
    ├── App.tsx                      # Root coordinator, role context, navigation tabs
    ├── main.tsx                     # React DOM entry point
    ├── index.css                    # Tailwind CSS v4 imports
    ├── types/
    │   └── index.ts                 # TypeScript interfaces (Entry, Ward, PollingCentre, etc.)
    ├── data/
    │   └── canonicalData.ts         # In-memory canonical records for Lurambi 6 wards & centres
    ├── lib/
    │   ├── normalisation/           # Stage 3 Importer Core
    │   │   ├── phone.ts             # E.164 normalisation (+254...), lost leading zeros, shared phone flag
    │   │   ├── nationalId.ts        # 7-8 digit validation, pending_id mapping, KDPA masking & hashing
    │   │   ├── wardMatcher.ts       # Trigram fuzzy ward matching & alias mapping
    │   │   ├── placeMatcher.ts      # Polling centre fuzzy matcher & junk value filter
    │   │   ├── supportLevel.ts      # Enum parser & legacy first-name label extractor
    │   │   ├── importerCore.ts       # Multi-tab parsing, deduplication, dry-run report generation
    │   │   └── normalisation.test.ts # 24 automated unit tests
    │   ├── duplicate/               # Stage 4 Duplicate Detection
    │   │   └── duplicateDetector.ts # Multi-factor blocking shield vs soft amber warning
    │   ├── verification/            # Stage 4 Pluggable Verification Providers
    │   │   ├── types.ts             # Provider interface & result contracts
    │   │   ├── RegisterImportProvider.ts # Matches against imported IEBC register table
    │   │   ├── ManualVerificationProvider.ts # Manual audit with mandatory evidence note
    │   │   ├── ExternalLinkProvider.ts   # Disabled stub with rate limiter & anti-scraping policy
    │   │   └── verificationManager.ts   # Provider factory & dispatcher
    │   ├── offline/                 # Stage 5 Offline Queue
    │   │   └── offlineQueue.ts      # IndexedDB store, sync manager, idempotency hasher
    │   ├── reports/                 # Stage 7 Reports
    │   │   ├── pdfGenerator.ts      # Executive PDF report with letterhead & priority tables
    │   │   └── excelExport.ts       # Multi-sheet clean campaign XLSX exporter
    │   └── synthetic/
    │       └── legacyWorkbookData.ts # 114 synthetic legacy records mirroring dirty spreadsheet
    └── components/
        ├── Header.tsx               # Responsive header with role switcher (Admin, Coord, Mobilizer)
        ├── ArchitectureView.tsx     # Stage 1: System architecture & folder tree viewer
        ├── SqlSchemaView.tsx        # Stage 2: Supabase DDL, RLS proof, schema downloader
        ├── DataHierarchyView.tsx    # Stage 2: Lurambi 6 Wards, Centres, Stations & Influencers
        ├── importer/
        │   └── ImportWizard.tsx     # Stage 3: 4-step wizard (File, Preview, Dry Run, Batch Commit)
        ├── verification/
        │   └── VerificationLogicView.tsx # Stage 4: Duplicate simulator, provider hub, "To Verify" sheet
        ├── capture/
        │   └── CaptureWizard.tsx    # Stage 5: Mobile capture wizard (360px), KDPA consent v1.2-2027
        ├── referral/
        │   └── ReferralView.tsx     # Stage 5: Mobilizer QR codes, WhatsApp share kit, public join link
        ├── offline/
        │   └── OfflineQueueView.tsx # Stage 5: IndexedDB inspector, weak-signal toggle, manual sync
        ├── mobilizer/
        │   └── MobilizerDashboard.tsx # Stage 5: Mobilizer bottom-nav shell (Capture, My List, Referrals)
        ├── admin/
        │   ├── AdminDashboard.tsx   # Stage 6: Admin navigation & tab router
        │   ├── FlagReviewQueue.tsx  # Stage 6: Flag review with mandatory reason & record merger
        │   ├── UserManagementView.tsx # Stage 6: Mobilizer approval, role assignment, referral codes
        │   ├── NetworkContactsManager.tsx # Stage 6: Faith leaders (Pastors) & CHPs with export guard
        │   ├── NeedsMappingQueue.tsx # Stage 6: Unmapped ward & centre alias resolver
        │   └── AuditLogViewer.tsx   # Stage 6: Immutable audit trail with old/new diff inspection
        └── analytics/
            ├── AnalyticsDashboard.tsx # Stage 7: Ward charts, completeness gauges, priority stations
            └── ProjectionModelCard.tsx # Stage 7: Turnout projection sliders & victory target model
```

---

## 4. Local Development Setup

### Prerequisites
- **Node.js**: v18.18.0 or v20.x+
- **NPM**: v9.x or v10.x+
- **Git**

### Installation Steps

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/campaign-tech/lurambi-field-platform.git
   cd lurambi-field-platform
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Copy the `.env.example` template:
   ```bash
   cp .env.example .env.local
   ```
   Edit `.env.local` with your Supabase credentials:
   ```ini
   NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
   NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
   SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
   ID_HASH_SALT="lurambi_2027_kdp_salt_xyz987"
   ENABLE_EXTERNAL_VERIFICATION="false"
   ```

4. **Run Local Development Server**:
   ```bash
   npm run dev
   ```
   Open your browser to `http://localhost:3000`.

5. **Verify Compilation & Linting**:
   ```bash
   npm run build
   ```

---

## 5. Supabase Database & Security Setup

The complete database structure is housed in `/supabase/schema.sql` and `/supabase/seed.sql`.

### Step-by-Step Provisioning

1. **Log in to Supabase Dashboard** (`https://supabase.com`) and create a new project named `lurambi-campaign-2027`.
2. **Execute Schema SQL**:
   - Navigate to the **SQL Editor** tab.
   - Open and copy the contents of `/supabase/schema.sql`.
   - Click **Run**. This establishes:
     - PostgreSQL Extensions: `pg_trgm`, `uuid-ossp`, `pgcrypto`.
     - Custom Enums: `user_role`, `support_level`, `verification_status`, `consent_status`, `data_source`.
     - Tables: `profiles`, `wards`, `polling_centres`, `polling_stations`, `place_aliases`, `voter_register`, `entries`, `flag_events`, `duplicate_attempts`, `network_contacts`, `imports`, `exports_log`, `audit_log`, `settings`, `data_subject_requests`.
     - GIN Trigram Indexes for fuzzy name, alias, and centre lookups.
     - Immutable Audit Rewrite Rules (`audit_log_no_update`, `audit_log_no_delete`).
     - Flag calculation trigger (`trg_compute_entry_flags`).
     - Row Level Security (RLS) policies on all tables.
3. **Execute Seed SQL**:
   - In the **SQL Editor**, open and copy `/supabase/seed.sql`.
   - Click **Run**. This seeds:
     - 6 Canonical Wards (Sheywe, Mahiakalo, Shirere, Butsotso East, Butsotso South, Butsotso Central).
     - 20 Primary Polling Centres and 40 Stations with IEBC codes and voter counts.
     - 30 Common Kenyan place aliases and dirty labels (`Shieywe`, `chillpark`, `Daisy`, `uncle devi`).
     - Initial Faith Leaders (Pastors) and Community Health Promoters (CHPs).
4. **Configure Authentication**:
   - Go to **Authentication -> Providers -> Email**.
   - Enable Email Signup and Confirm Email.
   - In **Authentication -> URL Configuration**, set Site URL to `https://your-domain.vercel.app` and add `http://localhost:3000` to Additional Redirect URLs.

### Row Level Security (RLS) Proof & Verification

The database enforces a strict non-repudiation model for mobilizers:
- **Admin**: Full read, insert, update (with mandatory audit reason), delete, and flag resolution.
- **Ward Coordinator**: Read-only access to entries in their assigned ward (`ward_filed_id`). Cannot edit or delete.
- **Mobilizer**:
  - `INSERT`: Allowed for new entries where `mobilizer_id = auth.uid()`.
  - `SELECT`: Allowed **only** for entries where `mobilizer_id = auth.uid()`.
  - `UPDATE`: **ZERO policy exists**. The PostgreSQL query planner unconditionally denies updates with error `42501` (permission denied).
  - `DELETE`: **ZERO policy exists**. The PostgreSQL query planner unconditionally denies deletions.

To verify this directly in the Supabase SQL editor:
```sql
-- Test 1: Mobilizer cannot update submitted entries
SET ROLE authenticated;
SET request.jwt.claim.sub = 'd0000001-0000-0000-0000-000000000001'; -- Erick Mobilizer

-- This update will fail with 0 rows affected or 42501 violation
UPDATE entries 
SET support_level = 'opponent' 
WHERE mobilizer_id = 'd0000001-0000-0000-0000-000000000001';

-- Test 2: Mobilizer cannot view records submitted by other mobilizers
SELECT count(*) FROM entries 
WHERE mobilizer_id != 'd0000001-0000-0000-0000-000000000001';
-- Returns 0 rows.
RESET ROLE;
```

---

## 6. Vercel Deployment Guide

### Deploying the Platform

1. **Import Project to Vercel**:
   - Connect your GitHub repository to Vercel (`https://vercel.com/new`).
   - Project Name: `lurambi-campaign-2027`.
   - Framework Preset: `Next.js` (or `Vite` for SPA deployment).
   - Root Directory: `./`
2. **Environment Variables**:
   In the Vercel project configuration, add:
   ```
   NEXT_PUBLIC_SUPABASE_URL = https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY = eyJhbGci...
   SUPABASE_SERVICE_ROLE_KEY = eyJhbGci...
   ID_HASH_SALT = [secure_random_production_salt]
   ENABLE_EXTERNAL_VERIFICATION = false
   APP_URL = https://lurambi2027.vercel.app
   ```
3. **Build & Output Settings**:
   - Build Command: `npm run build`
   - Output Directory: `dist` (or `.next` if using Next.js App Router)
   - Install Command: `npm install`
4. **Deploy**:
   Click **Deploy**. Verify that the production URL issues a green HTTPS certificate and headers include `X-Frame-Options: SAMEORIGIN` and `Content-Security-Policy`.

---

## 7. Kenya Data Protection Act (KDPA 2019) Statutory Compliance

Compliance with the *Data Protection Act, 2019* (Cap 411C, Laws of Kenya) and the *Data Protection (General) Regulations, 2021* is mandatory for all political campaigns in Kenya.

### Compliance Checklist

| Statutory Requirement | Legal Basis (KDPA) | Technical & Operational Implementation | Status |
|---|---|---|---|
| **ODPC Registration** | Section 18 | The Candidate/Campaign Secretariat must register as a **Data Controller** with the *Office of the Data Protection Commissioner (ODPC)* prior to launch. | **Mandatory Action** |
| **Lawful Basis & Consent** | Section 30, 32 | Every supporter entry records `consent_status: 'explicit_opt_in'`, `consent_timestamp`, and `consent_version: 'v1.2-2027'`. | **Built-in** |
| **Legacy Data Quarantine** | Regulation 10 | Legacy records from the Excel spreadsheet default to `consent_status: 'legacy_unconfirmed'`. These are barred from unsolicited communications until re-consented. | **Built-in** |
| **National ID Protection** | Section 25(f) | Plaintext National IDs are **never** indexed in plaintext. Salted SHA-256 (`id_hash`) is used for indexing. The UI masks IDs as `2****789`. Plaintext is accessible only to authorized Super Admins. | **Built-in** |
| **Direct Marketing Prohibition** | Section 37 | Unsolicited bulk political SMS/calls without explicit prior consent are prohibited. All exported contact lists contain an opt-out trail. | **Built-in** |
| **Public Service Neutrality (CHPs)** | Public Officer Ethics Act / KDPA | Community Health Promoters (CHPs) are flagged with `exclude_from_campaign_exports: true` by default to preserve public health neutrality. | **Built-in** |
| **Right of Access / Erasure** | Section 40, 41 | Built-in `data_subject_requests` table and admin workflow to process supporter rectification, erasure, and opt-out requests within statutory 21 days. | **Built-in** |
| **Data Retention & Purge** | Section 39 | Policy: All voter identifiable data is scheduled for cryptographic erasure or anonymisation **90 days after gazettement** of final 2027 election results. | **Policy Codified** |
| **Anti-Scraping Compliance** | Computer Misuse Act 2018 | Zero scraping or automated queries against IEBC or government websites. The `external_link` verification provider is disabled by default. | **Built-in** |

---

## 8. Comprehensive End-to-End Test Plan

### Test Matrix 1: Normalisation & Importer Core (24 Unit Tests)

Located at `/src/lib/normalisation/normalisation.test.ts`. Run with `npm test`.

1. **Kenyan Phone E.164 Normalisation**:
   - Valid 9-digit lost zero (`705961838`) → converts to `+254705961838` (PASS).
   - Valid 10-digit leading zero (`0712345678`) → converts to `+254712345678` (PASS).
   - Valid Safaricom 011 prefix (`0112345678`) → converts to `+254112345678` (PASS).
   - Valid international format with spaces (`+254 705 961 838`) → spaces stripped (PASS).
   - Invalid 8-digit phone (`70596183`) → flags `INVALID_PHONE` (PASS).
   - Shared phone detection across distinct family records → marks `SHARED_PHONE` informational flag without dropping row (PASS).
2. **National ID Normalisation**:
   - 7-digit ID (`7654321`) → validated as valid Kenyan ID (PASS).
   - 8-digit ID (`28491023`) → validated as valid Kenyan ID (PASS).
   - Missing / blank ID (`""`, `null`) → maps to `pending_id` + `MISSING_ID` flag (PASS).
   - Invalid length (`12345`) → flags `INVALID_ID_FORMAT` (PASS).
   - UI Masking (`28491023`) → produces `2****023` (PASS).
   - SHA-256 ID Hashing → produces reproducible HMAC hash with secret salt (PASS).
3. **Ward Spelling & Typo Resolution**:
   - Exact ward (`Sheywe`) → matches `Sheywe` (PASS).
   - Common typo `Shieywe` → resolves via alias table to `Sheywe` (PASS).
   - Typo `Mahialako` → resolves via alias table to `Mahiakalo` (PASS).
   - Lowercase with spaces `butsotso south  ` → resolves to `Butsotso South` (PASS).
   - Unknown ward string `Eldoret North` → flagged as `UNRESOLVED_WARD` and routed to Needs Mapping Queue (PASS).
4. **Polling Centre & Junk Filter**:
   - Canonical centre (`Kakamega Primary School`) → matches canonical centre ID (PASS).
   - Whitespace/casing `chillpark ` → resolves via alias table to `Shirere Primary School (Chillpark)` (PASS).
   - Junk values (`"Approved"`, `"Daisy"`, `"uncle devi"`, `"Chief Mutsembi"`) → flagged as `JUNK_POLLING_VALUE` and routed to Needs Mapping Queue without crashing (PASS).
5. **Support Level Cleanup**:
   - Valid enum value (`strong_supporter`) → parsed cleanly (PASS).
   - Misused first name (`"Zainab"`) → extracted to `legacy_mobilizer_label: "Zainab"`, and support level set to `not_assessed` (PASS).
   - Misused first name (`"Mildred"`) → extracted to `legacy_mobilizer_label: "Mildred"` (PASS).
   - Blank support value → mapped to `not_assessed` (PASS).

---

### Test Matrix 2: Duplicate Detection & Shield

1. **Hard Duplicate (Shield Block)**:
   - Input: Supporter with identical National ID (`28491023`) already in database.
   - Result: Form blocks submission; presents existing record date and ward.
2. **Hard Duplicate (Name + Phone)**:
   - Input: Identical normalised phone (`+254712345678`) and matching normalised full name (`Barasa Wekesa`).
   - Result: Form blocks submission; prevents duplicate entry.
3. **Soft Duplicate (Amber Warning)**:
   - Input: Identical phone (`+254712345678`) but different family name (`Mama Barasa Wekesa`).
   - Result: Allows submission; attaches informational `SHARED_PHONE` and `POSSIBLE_DUPLICATE` flag for admin review.
4. **Ward Proximity Warning**:
   - Input: Identical name in different polling centre in same ward.
   - Result: Displays amber warning modal asking mobilizer to confirm identity before finalising.

---

### Test Matrix 3: Voter Register Verification Providers

1. **Provider 1: `register_import` (Authorised IEBC Register)**:
   - Import test CSV with 50 voter records.
   - Query National ID `28491023`: returns `verified` with polling station name.
   - Query unlisted ID `99999999`: returns `not_found`.
2. **Provider 2: `manual`**:
   - Admin marks record as `verified`.
   - Mandatory check: Submission without evidence note fails validation.
   - With evidence note `"Checked physical IEBC copy at CDF Office on 14/03/2026"`: succeeds and writes to `audit_log`.
3. **Provider 3: `external_link` (Disabled Stub)**:
   - Verify `enabled: false` by default in settings.
   - Attempt verification: returns explicit error `"External provider disabled. Direct scraping is prohibited under Kenyan law."`
   - Verify rate limiter enforces maximum 5 requests per minute.

---

### Test Matrix 4: Mobilizer Security & RLS Engine Denial

1. **Mobilizer Self-Isolation**:
   - Mobilizer A logs in: queries `entries` → returns only entries where `mobilizer_id = Mobilizer_A_ID`.
2. **Engine Denial of UPDATE**:
   - Mobilizer A issues `UPDATE entries SET name = 'Hacked' WHERE id = 'ent-01'`.
   - Postgres engine returns SQLSTATE `42501` (insufficient privilege) or zero rows updated.
3. **Engine Denial of DELETE**:
   - Mobilizer A issues `DELETE FROM entries WHERE id = 'ent-01'`.
   - Postgres engine returns SQLSTATE `42501`.
4. **Admin Audit Enforcement**:
   - Admin updates record: `audit_log` records `admin_id`, `record_id`, `old_values`, `new_values`, and mandatory `reason`.

---

### Test Matrix 5: Offline Field Queue & PWA Sync

1. **Weak-Signal Capture**:
   - Toggle "Simulate Weak Signal / Offline" in UI.
   - Submit new supporter record `Nafula Synthetic (+254711223344)`.
   - Verify record is saved to native IndexedDB store `lurambi_offline_db` with status `pending`.
2. **Persistence**:
   - Refresh browser tab / restart browser.
   - Inspect IndexedDB queue: pending record remains intact.
3. **Idempotent Batch Sync**:
   - Re-enable connectivity and trigger sync.
   - Sync service transmits record with client-generated UUID and SHA-256 payload hash.
   - Server returns 200 OK; queue marks record `synced` and purges from pending list.
   - Duplicate sync re-transmission: server deduplicates via idempotency key; zero duplicate entries created.

---

### Test Matrix 6: Analytics, Victory Projections & Export Integrity

1. **Ward Aggregation**:
   - Verify sum of supporters across all 6 wards matches total database count.
2. **Victory Projection Model**:
   - Total Registered Voters in Lurambi: 120,000.
   - Turnout slider set to 65% (78,000 voters expected).
   - Target victory share set to 52% (40,560 winning threshold).
   - Supporter deficit accurately calculates `40,560 - Current Verified Supporters`.
3. **Executive PDF Export**:
   - Click "Download Executive PDF".
   - Generates multi-page document with official header, ward distribution table, priority deficit stations, and KDPA confidentiality watermark.
4. **Clean Excel Export**:
   - Click "Export Clean XLSX".
   - Generates spreadsheet with sanitized fields: phone E.164, masked IDs, ward name, verification status, and consent metadata.
   - Confirms CHPs with `exclude_from_campaign_exports: true` are excluded from contact export.

---

## 9. Operational Handover & Campaign Runbook

### Key Contacts & Responsibilities
- **Campaign Manager / Super Admin**: Manages user approvals, oversees verification provider settings, authorises official data exports, reviews audit logs.
- **Ward Coordinators (6 Wards)**: Reviews mobilizers in their respective wards (Sheywe, Mahiakalo, Shirere, Butsotso East, Butsotso South, Butsotso Central), monitors daily capture targets, identifies polling station deficits.
- **Field Mobilizers**: Deployed at village and sub-location levels; capture consent-verified supporters using mobile smartphones; distribute referral QR codes at market days, churches, and barazas.
- **Data Protection Officer (DPO)**: Responsible for ODPC registration compliance, managing Data Subject Access Requests (DSAR), and overseeing the 90-day post-election cryptographic purge.

### Weekly Campaign Cadence
1. **Monday Morning**: Ward coordinators review unverified queues and export "To Verify" sheets for physical cross-checks at constituency offices.
2. **Wednesday Mid-week**: Admin reviews Needs Mapping queue to resolve any new place aliases or spelling variants reported by field mobilizers.
3. **Friday Evening**: Executive analytics review: inspect turnout projections, priority deficit polling stations, and mobilizer referral leaderboards.

---

*Lurambi Campaign Field Platform © 2027. Built in strict accordance with the Laws of Kenya, the Kenya Data Protection Act 2019, and the IEBC Electoral Code of Conduct.*
