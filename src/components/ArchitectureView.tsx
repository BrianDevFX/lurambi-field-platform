import React, { useState } from 'react';
import { 
  FolderTree, 
  Layers, 
  ShieldCheck, 
  Database, 
  Smartphone, 
  Workflow, 
  FileSpreadsheet, 
  Check, 
  Copy,
  ChevronRight,
  Lock,
  Radio,
  FileCheck2,
  Users
} from 'lucide-react';

export const ArchitectureView: React.FC = () => {
  const [copied, setCopied] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'folder_structure' | 'data_flow' | 'verification' | 'kdpa'>('folder_structure');

  const folderStructureText = `lurambi-campaign-platform/
├── app/                              # Next.js 14+ App Router
│   ├── (auth)/
│   │   ├── login/page.jsx            # Phone / OTP & password login
│   │   ├── register/page.jsx         # Mobilizer registration & ward selection
│   │   └── pending-approval/page.jsx # Mobilizer onboarding wait screen
│   ├── (dashboard)/
│   │   ├── layout.jsx                # Mobile-first shell (bottom tabs on mobile, sidebar on desktop)
│   │   ├── capture/page.jsx          # Mobile field capture wizard (4-step, thumb-friendly)
│   │   ├── entries/page.jsx          # Supporter list (Mobilizer: own only; Coord: ward; Admin: all)
│   │   ├── search/page.jsx           # Rapid debounced voter register search (anti-scraping capped)
│   │   ├── referrals/page.jsx        # Mobilizer QR code, referral links, and direct WhatsApp share
│   │   ├── profile/page.jsx          # User credentials, home ward, performance statistics
│   │   └── offline-queue/page.jsx    # IndexedDB queue inspector with manual retry and conflict badge
│   ├── (admin)/admin/
│   │   ├── layout.jsx                # Admin navigation shell with compliance status badges
│   │   ├── analytics/page.jsx        # Coverage %, funnel, top issues, projection model
│   │   ├── imports/
│   │   │   ├── page.jsx              # Import history and batch status
│   │   │   └── wizard/page.jsx       # Legacy Excel & voter register 4-step import wizard
│   │   ├── exports/page.jsx          # Audit-logged exports (XLSX, CSV, PDF reports)
│   │   ├── flags/page.jsx            # Flag review queue (DUPLICATE, WARD_MISMATCH, etc.)
│   │   ├── verification/page.jsx     # Verification queue & "to-verify" sheet generator
│   │   ├── network-contacts/page.jsx # Pastors & CHPs community influencers manager
│   │   ├── places/page.jsx           # Canonical wards, centres, stations, and place aliases
│   │   ├── users/page.jsx            # User approvals, role assignment, ward coordinator grants
│   │   ├── audit-log/page.jsx        # Immutable compliance audit log viewer
│   │   └── settings/page.jsx         # Projection parameters, verification switches, consent text
│   ├── join/[referral_code]/page.jsx # Public supporter self-registration page (EN/SW toggle)
│   ├── privacy/page.jsx              # Kenya Data Protection Act 2019 Privacy Notice
│   ├── data-request/page.jsx         # Data subject access/rectification/deletion request form
│   ├── api/
│   │   ├── sync/route.js             # Batch endpoint for offline IndexedDB queue sync
│   │   ├── verification/route.js     # Verification dispatcher (register, manual, external stub)
│   │   ├── imports/process/route.js  # Server-side batch insert (1,000 rows/batch)
│   │   └── export/pdf/route.js       # Server-side jsPDF generator with campaign header
│   ├── manifest.json                 # PWA Web App Manifest
│   └── sw.js                         # Service Worker for offline app caching & asset precache
├── components/
│   ├── ui/                           # shadcn-style atomic components (Button, Input, Badge, Dialog)
│   ├── capture/                      # Thumb-friendly capture step components & duplicate warning modal
│   ├── importer/                     # File dropzone, sheet selector, column mapper, dry-run report
│   ├── analytics/                    # Recharts heat tables, funnel diagrams, ward breakdown cards
│   ├── navigation/                   # Mobile bottom navigation bar & desktop sidebar
│   └── verification/                 # Verification status pill, manual override dialog
├── lib/
│   ├── supabase/
│   │   ├── client.js                 # Browser Supabase client (respects RLS)
│   │   ├── server.js                 # Server Component / Route Handler Supabase client
│   │   └── admin.js                  # Service role client (used strictly for audit-logged operations)
│   ├── verification/
│   │   ├── index.js                  # VerificationProvider abstract interface
│   │   ├── register-import.js        # Adapter 1: Matches against voter_register table
│   │   ├── manual-adapter.js         # Adapter 2: Admin manual marking & bulk result sheet upload
│   │   └── external-link-stub.js     # Adapter 3: Disabled stub with strict rate limit & config points
│   ├── normalisation/
│   │   ├── phone.js                  # Kenyan phone normaliser (+254 standardisation)
│   │   ├── national-id.js            # Kenyan ID validator (7-8 digits) and salting hash
│   │   ├── place-matcher.js          # Trigram fuzzy match to canonical wards & polling centres
│   │   └── support-level.js          # Enum validation & legacy first-name detection
│   ├── offline/
│   │   ├── db.js                     # IndexedDB offline store (idb / Dexie pattern)
│   │   └── sync-engine.js            # Background sync runner with exponential backoff
│   └── audit.js                      # Audit log recording helper (enforces mandatory reason)
├── supabase/
│   ├── schema.sql                    # Production DDL (enums, tables, RLS, triggers, indexes)
│   ├── seed.sql                      # Canonical wards, centres, aliases, settings & synthetic data
│   └── tests/
│       └── rls_security_test.sql     # SQL test proving mobilizers cannot UPDATE or DELETE
├── public/                           # Offline icons, flags, campaign logos, manifest icons
├── .env.example                      # Documented environment variables
└── README.md                         # Architecture, Supabase setup, Vercel deploy & KDPA checklist`;

  const copyFolderTree = () => {
    navigator.clipboard.writeText(folderStructureText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className="bg-gradient-to-r from-emerald-900 via-emerald-800 to-teal-900 rounded-2xl p-6 sm:p-8 text-white shadow-xl">
        <div className="max-w-4xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 text-xs font-semibold uppercase tracking-wider mb-3">
            <Layers className="w-3.5 h-3.5" />
            Stage 1 Deliverable: System Architecture & Blueprint
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Lurambi Campaign Field Platform Architecture
          </h2>
          <p className="mt-2 text-sm sm:text-base text-emerald-100/90 leading-relaxed">
            Engineered specifically for the 2027 Lurambi MP campaign across all 6 wards: 
            <span className="font-semibold text-white"> Sheywe, Shirere, Mahiakalo, Butsotso East, Butsotso South, and Butsotso Central</span>.
            Features strict mobile-first thumb ergonomics (360px viewport priority), offline IndexedDB queueing, 
            PostgreSQL Row Level Security, pluggable voter verification adapters, and Kenya Data Protection Act 2019 compliance.
          </p>

          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-emerald-950/50 backdrop-blur-xs p-3 rounded-xl border border-emerald-700/50">
              <span className="text-emerald-300 font-semibold block">Framework</span>
              <span className="font-bold text-white text-sm">Next.js 14+ App Router</span>
            </div>
            <div className="bg-emerald-950/50 backdrop-blur-xs p-3 rounded-xl border border-emerald-700/50">
              <span className="text-emerald-300 font-semibold block">Database & Auth</span>
              <span className="font-bold text-white text-sm">Supabase (Postgres RLS)</span>
            </div>
            <div className="bg-emerald-950/50 backdrop-blur-xs p-3 rounded-xl border border-emerald-700/50">
              <span className="text-emerald-300 font-semibold block">Offline Engine</span>
              <span className="font-bold text-white text-sm">PWA + IndexedDB Sync</span>
            </div>
            <div className="bg-emerald-950/50 backdrop-blur-xs p-3 rounded-xl border border-emerald-700/50">
              <span className="text-emerald-300 font-semibold block">Data Protection</span>
              <span className="font-bold text-white text-sm">KDPA 2019 Certified</span>
            </div>
          </div>
        </div>
      </div>

      {/* Sub-tab navigation */}
      <div className="flex border-b border-gray-200 space-x-2 sm:space-x-4 overflow-x-auto">
        <button
          onClick={() => setActiveSubTab('folder_structure')}
          className={`py-2 px-3 text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
            activeSubTab === 'folder_structure'
              ? 'border-emerald-700 text-emerald-800'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <FolderTree className="w-4 h-4" />
          Folder Structure & Tech Stack
        </button>
        <button
          onClick={() => setActiveSubTab('data_flow')}
          className={`py-2 px-3 text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
            activeSubTab === 'data_flow'
              ? 'border-emerald-700 text-emerald-800'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Workflow className="w-4 h-4" />
          Hierarchy & Data Flow Pipelines
        </button>
        <button
          onClick={() => setActiveSubTab('verification')}
          className={`py-2 px-3 text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
            activeSubTab === 'verification'
              ? 'border-emerald-700 text-emerald-800'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <FileCheck2 className="w-4 h-4" />
          VerificationProvider Architecture
        </button>
        <button
          onClick={() => setActiveSubTab('kdpa')}
          className={`py-2 px-3 text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
            activeSubTab === 'kdpa'
              ? 'border-emerald-700 text-emerald-800'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          KDPA 2019 Security & RLS Matrix
        </button>
      </div>

      {/* Tab 1: Folder Structure */}
      {activeSubTab === 'folder_structure' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <FolderTree className="w-5 h-5 text-emerald-700" />
              Complete Project Directory Tree (Next.js 14+ App Router, JavaScript / JSDoc)
            </h3>
            <button
              onClick={copyFolderTree}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied Tree' : 'Copy Tree'}
            </button>
          </div>

          <div className="bg-gray-950 text-gray-100 rounded-xl p-4 font-mono text-xs overflow-x-auto leading-relaxed border border-gray-800 shadow-inner">
            <pre>{folderStructureText}</pre>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
              <h4 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-emerald-700" />
                Mobile-First Viewport (360px)
              </h4>
              <p className="mt-1.5 text-xs text-gray-600 leading-relaxed">
                Designed for low-end Android smartphones prevalent among field mobilizers in Lurambi.
                Touch targets exceed 48px, high-contrast text works in direct sunlight, and single-handed thumb flows dominate.
              </p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
              <h4 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-700" />
                Offline IndexedDB Queue
              </h4>
              <p className="mt-1.5 text-xs text-gray-600 leading-relaxed">
                Network drops in rural polling centres (e.g. Butsotso South or Shikoti) automatically route captures to an IndexedDB store. 
                Auto-sync activates when signal returns, with background retry and conflict-free idempotency hashing.
              </p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
              <h4 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                <Lock className="w-4 h-4 text-emerald-700" />
                No Update / Delete for Mobilizers
              </h4>
              <p className="mt-1.5 text-xs text-gray-600 leading-relaxed">
                Enforced both in the UI and cryptographically via Supabase Postgres RLS.
                Mobilizers can create entries and read only their own records; zero UPDATE or DELETE permissions are granted to mobilizer roles.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Data Flow Pipelines */}
      {activeSubTab === 'data_flow' && (
        <div className="space-y-6">
          {/* Hierarchy Banner */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <h3 className="font-bold text-emerald-950 text-sm flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-700" />
              Standard Campaign Geographic Hierarchy (Used Everywhere)
            </h3>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-emerald-900">
              <span className="px-3 py-1.5 bg-white border border-emerald-300 rounded-lg shadow-2xs">
                Constituency: Lurambi (Kakamega County)
              </span>
              <ChevronRight className="w-4 h-4 text-emerald-500" />
              <span className="px-3 py-1.5 bg-white border border-emerald-300 rounded-lg shadow-2xs">
                6 Canonical Wards (Sheywe, Shirere, etc.)
              </span>
              <ChevronRight className="w-4 h-4 text-emerald-500" />
              <span className="px-3 py-1.5 bg-white border border-emerald-300 rounded-lg shadow-2xs">
                Polling Centres (Schools, Halls, Grounds)
              </span>
              <ChevronRight className="w-4 h-4 text-emerald-500" />
              <span className="px-3 py-1.5 bg-white border border-emerald-300 rounded-lg shadow-2xs">
                Polling Stations (Streams 1, 2, ...)
              </span>
            </div>
          </div>

          {/* Capture Pipeline vs Importer Pipeline */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                <Smartphone className="w-5 h-5 text-emerald-700" />
                <h4 className="font-bold text-sm text-gray-900">Field Capture Flow (Mobilizer App)</h4>
              </div>
              <ol className="space-y-3 text-xs text-gray-600">
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center shrink-0">1</span>
                  <div>
                    <strong className="text-gray-900">Fast Anti-Duplicate Search:</strong> Search existing entries and voter register by ID or Phone (results capped to 10 rows to prevent scraping).
                  </div>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center shrink-0">2</span>
                  <div>
                    <strong className="text-gray-900">Duplicate Shield:</strong> If exact ID or high similarity match exists, show masked record (2****789) and who captured it. Log attempt.
                  </div>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center shrink-0">3</span>
                  <div>
                    <strong className="text-gray-900">Ward Bucket & Details:</strong> Select filing ward (default: voter ward), canonical polling centre, support level enum, key issues.
                  </div>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center shrink-0">4</span>
                  <div>
                    <strong className="text-gray-900">Mandatory Consent & Hash:</strong> Check mandatory KDPA 2019 consent box. Entry hashed for idempotency and committed to Supabase (or IndexedDB if offline).
                  </div>
                </li>
              </ol>
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                <FileSpreadsheet className="w-5 h-5 text-emerald-700" />
                <h4 className="font-bold text-sm text-gray-900">Legacy Excel Importer Pipeline</h4>
              </div>
              <ol className="space-y-3 text-xs text-gray-600">
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-800 font-bold flex items-center justify-center shrink-0">1</span>
                  <div>
                    <strong className="text-gray-900">Multi-Tab De-duplication:</strong> Ingest Raw Data + 6 Ward tabs + Pastors + CHPs. Keep earliest <code className="bg-gray-100 px-1 py-0.5 rounded">captured_on</code> date.
                  </div>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-800 font-bold flex items-center justify-center shrink-0">2</span>
                  <div>
                    <strong className="text-gray-900">ID & Phone Normalisation:</strong> Missing IDs marked <code className="bg-amber-100 px-1 py-0.5 rounded text-amber-900">pending_id</code>. Phones normalised to +254 (07xx, 254xx, spaces stripped).
                  </div>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-800 font-bold flex items-center justify-center shrink-0">3</span>
                  <div>
                    <strong className="text-gray-900">Place Aliasing:</strong> Fuzzy map "Shieywe", "Mahialako", "chillpark". Junk entries ("Daisy", "Approved") routed to Needs Mapping queue.
                  </div>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-800 font-bold flex items-center justify-center shrink-0">4</span>
                  <div>
                    <strong className="text-gray-900">Support Misuse Fix:</strong> First names in support column mapped to <code className="bg-gray-100 px-1 py-0.5 rounded">legacy_mobilizer_label</code>, support level set to <code className="bg-gray-100 px-1 py-0.5 rounded">not_assessed</code>.
                  </div>
                </li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: VerificationProvider Architecture */}
      {activeSubTab === 'verification' && (
        <div className="space-y-5">
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs">
            <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
              <FileCheck2 className="w-5 h-5 text-emerald-700" />
              VerificationProvider Adapter Pattern (<code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">lib/verification/</code>)
            </h3>
            <p className="mt-2 text-xs text-gray-600 leading-relaxed">
              Because the official IEBC voter register link is unconfirmed and third-party scraping is strictly prohibited,
              the platform isolates voter verification behind a modular provider interface with 3 decoupled adapters:
            </p>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Adapter 1 */}
              <div className="p-4 rounded-xl border-2 border-emerald-500/40 bg-emerald-50/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Adapter 1</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold text-[10px]">Active</span>
                </div>
                <h4 className="font-bold text-sm text-gray-900">register_import</h4>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Matches supporter national IDs and trigram names against the local <code className="bg-white px-1 py-0.5 rounded border text-[11px]">voter_register</code> table 
                  populated by admin upload of authorised register extracts (CSV/XLSX). Zero external network calls.
                </p>
              </div>

              {/* Adapter 2 */}
              <div className="p-4 rounded-xl border-2 border-emerald-500/40 bg-emerald-50/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Adapter 2</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold text-[10px]">Active</span>
                </div>
                <h4 className="font-bold text-sm text-gray-900">manual</h4>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Admin or authorised field verifiers manually mark status (with mandatory evidence note) or upload a 
                  checked results spreadsheet (ID, status). Powers the offline "To Verify" downloadable sheet.
                </p>
              </div>

              {/* Adapter 3 */}
              <div className="p-4 rounded-xl border-2 border-amber-400/40 bg-amber-50/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">Adapter 3</span>
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-semibold text-[10px]">Disabled Stub</span>
                </div>
                <h4 className="font-bold text-sm text-gray-900">external_link (Disabled)</h4>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Configured strictly as a dormant stub with documented endpoints, per-user rate limit (5 req/min), and admin kill-switch.
                  Contains non-negotiable warning: never enable until official written authorization from IEBC is confirmed.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
            <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-2">
              Verification Status Enum States:
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
              <div className="p-2.5 bg-white rounded-lg border border-gray-200">
                <span className="font-bold text-gray-800 block">unverified</span>
                <span className="text-[11px] text-gray-500">Default for new captures</span>
              </div>
              <div className="p-2.5 bg-white rounded-lg border border-emerald-200 text-emerald-900">
                <span className="font-bold block">verified</span>
                <span className="text-[11px] text-emerald-700">Confirmed in Lurambi register</span>
              </div>
              <div className="p-2.5 bg-white rounded-lg border border-rose-200 text-rose-900">
                <span className="font-bold block">not_found</span>
                <span className="text-[11px] text-rose-700">Not present on official roll</span>
              </div>
              <div className="p-2.5 bg-white rounded-lg border border-purple-200 text-purple-900">
                <span className="font-bold block">wrong_constituency</span>
                <span className="text-[11px] text-purple-700">Registered outside Lurambi</span>
              </div>
              <div className="p-2.5 bg-white rounded-lg border border-amber-200 text-amber-900">
                <span className="font-bold block">pending_id</span>
                <span className="text-[11px] text-amber-700">National ID skipped at capture</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: KDPA 2019 & RLS Matrix */}
      {activeSubTab === 'kdpa' && (
        <div className="space-y-5">
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-700" />
                <h3 className="font-bold text-sm text-gray-900">
                  Kenya Data Protection Act (KDPA) 2019 Legal & Technical Safeguards
                </h3>
              </div>
              <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full font-bold text-xs">
                Statutory Compliance
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 bg-gray-50 rounded-lg space-y-1.5 border border-gray-200">
                <h4 className="font-bold text-gray-900">1. Explicit Prior Consent (Section 30)</h4>
                <p className="text-gray-600 leading-relaxed">
                  Every field submission logs <code className="bg-white px-1 border rounded">consent_at</code>, 
                  <code className="bg-white px-1 border rounded">consent_text_version</code>, and the mobilizer identifier.
                  Legacy rows default to <code className="bg-amber-100 text-amber-900 px-1 rounded">legacy_unconfirmed</code> and are barred from direct outreach SMS.
                </p>
              </div>

              <div className="p-3.5 bg-gray-50 rounded-lg space-y-1.5 border border-gray-200">
                <h4 className="font-bold text-gray-900">2. National ID Cryptographic Protection</h4>
                <p className="text-gray-600 leading-relaxed">
                  National IDs are never exposed in raw plaintext in standard queries. A salted SHA-256 hash (<code className="bg-white px-1 border rounded">id_hash</code>) 
                  handles indexing and duplicate prevention, with PGP symmetric encryption for authorized reveals. UI masks IDs as <code className="bg-white px-1 border rounded">2****789</code>.
                </p>
              </div>

              <div className="p-3.5 bg-gray-50 rounded-lg space-y-1.5 border border-gray-200">
                <h4 className="font-bold text-gray-900">3. Immutable Audit Trail (Section 42)</h4>
                <p className="text-gray-600 leading-relaxed">
                  Postgres table <code className="bg-white px-1 border rounded">audit_log</code> is protected with rewrite rules that reject UPDATE or DELETE operations.
                  Any administrative modification, record merge, or ID reveal mandates a recorded reason.
                </p>
              </div>

              <div className="p-3.5 bg-gray-50 rounded-lg space-y-1.5 border border-gray-200">
                <h4 className="font-bold text-gray-900">4. Community Health Promoter Neutrality</h4>
                <p className="text-gray-600 leading-relaxed">
                  CHPs linked to Community Units (CUs) are classified under <code className="bg-white px-1 border rounded">network_contacts</code> with 
                  <code className="bg-white px-1 border rounded">exclude_from_campaign_exports = true</code> enabled by default, 
                  preventing violations of public health neutrality guidelines.
                </p>
              </div>
            </div>

            {/* RLS Permission Matrix Table */}
            <div className="pt-2">
              <h4 className="font-bold text-xs text-gray-900 uppercase tracking-wider mb-2">
                PostgreSQL Row Level Security (RLS) Permission Matrix
              </h4>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200 text-xs">
                  <thead className="bg-gray-100 text-gray-700 font-bold">
                    <tr>
                      <th className="py-2 px-3 text-left">Database Entity</th>
                      <th className="py-2 px-3 text-center">Mobilizer</th>
                      <th className="py-2 px-3 text-center">Ward Coordinator</th>
                      <th className="py-2 px-3 text-center">Campaign Admin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 text-gray-600">
                    <tr>
                      <td className="py-2.5 px-3 font-semibold text-gray-900">Entries (Supporters)</td>
                      <td className="py-2.5 px-3 text-center text-emerald-700 font-semibold">INSERT + SELECT (Own Only)<br/><span className="text-rose-600 text-[10px] font-bold">NO UPDATE / DELETE</span></td>
                      <td className="py-2.5 px-3 text-center text-emerald-700">SELECT (Own Ward Only)<br/><span className="text-rose-600 text-[10px] font-bold">NO UPDATE / DELETE</span></td>
                      <td className="py-2.5 px-3 text-center text-emerald-800 font-bold">FULL (INSERT/SELECT/UPDATE/DELETE + Reason)</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-semibold text-gray-900">Voter Register Roll</td>
                      <td className="py-2.5 px-3 text-center text-emerald-700">SELECT (Capped Rate-Limited)</td>
                      <td className="py-2.5 px-3 text-center text-emerald-700">SELECT (Ward Scope)</td>
                      <td className="py-2.5 px-3 text-center text-emerald-800 font-bold">FULL CRUD & Bulk Import</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-semibold text-gray-900">Mobilizer Profiles</td>
                      <td className="py-2.5 px-3 text-center text-emerald-700">READ Own Profile</td>
                      <td className="py-2.5 px-3 text-center text-emerald-700 font-semibold">APPROVE Ward Mobilizers</td>
                      <td className="py-2.5 px-3 text-center text-emerald-800 font-bold">FULL User Administration</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-semibold text-gray-900">Audit Log</td>
                      <td className="py-2.5 px-3 text-center text-rose-600 font-semibold">No Access</td>
                      <td className="py-2.5 px-3 text-center text-rose-600 font-semibold">No Access</td>
                      <td className="py-2.5 px-3 text-center text-emerald-800 font-bold">READ ONLY (Immutable)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
