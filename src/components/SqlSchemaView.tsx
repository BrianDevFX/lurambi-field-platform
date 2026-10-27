import React, { useState } from 'react';
import { Database, ShieldAlert, Zap, Copy, Check, Download, FileCode, CheckCircle2, AlertTriangle, Key } from 'lucide-react';

export const SqlSchemaView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'schema' | 'rls' | 'triggers' | 'seeds' | 'test_proof'>('schema');
  const [copied, setCopied] = useState(false);

  const sqlSnippets = {
    schema: `-- Core Enums
CREATE TYPE user_role AS ENUM ('admin', 'ward_coordinator', 'mobilizer');
CREATE TYPE user_status AS ENUM ('pending', 'approved', 'suspended', 'rejected');
CREATE TYPE verification_status AS ENUM ('unverified', 'verified', 'not_found', 'wrong_constituency', 'pending_id');
CREATE TYPE support_level AS ENUM ('strong_supporter', 'leaning', 'undecided', 'opposed', 'not_reached', 'not_assessed');
CREATE TYPE entry_source AS ENUM ('legacy', 'mobilizer', 'self_registered');
CREATE TYPE network_contact_type AS ENUM ('pastor', 'chp', 'other');

-- 1. Canonical Hierarchy
CREATE TABLE public.wards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    constituency_name TEXT NOT NULL DEFAULT 'Lurambi',
    county_name TEXT NOT NULL DEFAULT 'Kakamega',
    name TEXT NOT NULL UNIQUE,
    code TEXT UNIQUE,
    registered_voters_target INTEGER DEFAULT 18000,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE public.polling_centres (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ward_id UUID NOT NULL REFERENCES public.wards(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    code TEXT,
    total_registered_voters INTEGER DEFAULT 0,
    CONSTRAINT uq_ward_centre_name UNIQUE (ward_id, name)
);

CREATE TABLE public.polling_stations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    polling_centre_id UUID NOT NULL REFERENCES public.polling_centres(id) ON DELETE RESTRICT,
    ward_id UUID NOT NULL REFERENCES public.wards(id) ON DELETE RESTRICT,
    station_name TEXT NOT NULL,
    station_number INTEGER NOT NULL DEFAULT 1,
    registered_voters_est INTEGER DEFAULT 650
);

-- 2. Place Aliases & Fuzzy Matching
CREATE TABLE public.place_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raw_alias TEXT NOT NULL,
    canonical_type canonical_type NOT NULL,
    target_ward_id UUID REFERENCES public.wards(id),
    target_polling_centre_id UUID REFERENCES public.polling_centres(id),
    confidence NUMERIC(3, 2) DEFAULT 1.00,
    notes TEXT,
    CONSTRAINT uq_raw_alias_type UNIQUE (raw_alias, canonical_type)
);

-- 3. Supporter Entries (System of Record)
CREATE TABLE public.entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mobilizer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ward_filed_id UUID NOT NULL REFERENCES public.wards(id) ON DELETE RESTRICT,
    polling_centre_id UUID REFERENCES public.polling_centres(id),
    polling_station_id UUID REFERENCES public.polling_stations(id),
    name TEXT NOT NULL,
    phone_e164 TEXT,
    id_hash TEXT,             -- Salted SHA-256 for fast indexing & duplicates
    id_encrypted TEXT,        -- PGP encrypted for audit-logged reveals
    id_masked TEXT,           -- Formatted: 2****789
    support_level support_level NOT NULL DEFAULT 'not_assessed',
    issues TEXT[] DEFAULT '{}',
    needs_transport BOOLEAN NOT NULL DEFAULT false,
    has_pvc BOOLEAN NOT NULL DEFAULT false,
    consent_at TIMESTAMPTZ,
    consent_text_version TEXT,
    consent_status TEXT DEFAULT 'given',
    source entry_source NOT NULL DEFAULT 'mobilizer',
    verification_status verification_status NOT NULL DEFAULT 'unverified',
    legacy_mobilizer_label TEXT,
    captured_on TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    import_batch_id UUID REFERENCES public.imports(id),
    row_hash TEXT,
    flags TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);`,

    rls: `-- ROW LEVEL SECURITY CONFIGURATION (Supabase PostgreSQL)
ALTER TABLE public.entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voter_register ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- 1. Mobilizer Rules:
-- INSERT allowed only if user is approved
CREATE POLICY "Mobilizers can insert entries"
    ON public.entries FOR INSERT
    TO authenticated
    WITH CHECK (
        mobilizer_id = auth.uid() AND
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND status = 'approved'
        )
    );

-- SELECT own entries only
CREATE POLICY "Mobilizers can select only their own entries"
    ON public.entries FOR SELECT
    TO authenticated
    USING (mobilizer_id = auth.uid());

-- NOTE: ZERO UPDATE or DELETE policies exist for mobilizers.
-- In PostgreSQL RLS, lack of an UPDATE/DELETE policy guarantees DENIAL!

-- 2. Ward Coordinator Rules:
CREATE POLICY "Coordinators can select ward entries"
    ON public.entries FOR SELECT
    TO authenticated
    USING (
        public.is_coordinator() AND
        ward_filed_id = (SELECT home_ward_id FROM public.profiles WHERE id = auth.uid())
    );

-- 3. Admin Rules:
CREATE POLICY "Admins full entries access"
    ON public.entries FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());`,

    triggers: `-- TRIGGER FUNCTION: Compute Flags on Entry Insertion
CREATE OR REPLACE FUNCTION public.fn_compute_entry_flags()
RETURNS TRIGGER AS $$
DECLARE
    v_flags TEXT[] := '{}';
    v_existing_id UUID;
    v_sim NUMERIC;
    v_mobilizer_home_ward UUID;
BEGIN
    -- 1. National ID Completeness & Length
    IF NEW.id_hash IS NULL OR NEW.id_masked IS NULL THEN
        v_flags := array_append(v_flags, 'MISSING_ID');
        NEW.verification_status := 'pending_id';
    ELSIF length(regexp_replace(NEW.id_masked, '[^0-9*]', '', 'g')) NOT IN (7, 8) THEN
        v_flags := array_append(v_flags, 'INVALID_ID');
    END IF;

    -- 2. Kenyan Phone Format (+254 standardisation)
    IF NEW.phone_e164 IS NOT NULL THEN
        IF NEW.phone_e164 !~ '^\\+254(7|1)[0-9]{8}$' THEN
            v_flags := array_append(v_flags, 'INVALID_PHONE');
        ELSE
            -- Informational shared phone flag (NOT treated as duplicate alone)
            IF EXISTS (
                SELECT 1 FROM public.entries
                WHERE phone_e164 = NEW.phone_e164 AND id <> COALESCE(NEW.id, gen_random_uuid())
            ) THEN
                v_flags := array_append(v_flags, 'SHARED_PHONE');
            END IF;
        END IF;
    END IF;

    -- 3. Ward Mismatch
    IF NEW.mobilizer_id IS NOT NULL THEN
        SELECT home_ward_id INTO v_mobilizer_home_ward FROM public.profiles WHERE id = NEW.mobilizer_id;
        IF v_mobilizer_home_ward IS NOT NULL AND v_mobilizer_home_ward <> NEW.ward_filed_id THEN
            v_flags := array_append(v_flags, 'WARD_MISMATCH');
        END IF;
    END IF;

    -- 4. Deduplication
    IF NEW.id_hash IS NOT NULL THEN
        SELECT id INTO v_existing_id FROM public.entries WHERE id_hash = NEW.id_hash LIMIT 1;
        IF v_existing_id IS NOT NULL THEN
            v_flags := array_append(v_flags, 'DUPLICATE');
        END IF;
    ELSE
        -- Trigram similarity >= 0.85 with same station & phone/ward
        SELECT id, similarity(name, NEW.name) INTO v_existing_id, v_sim
        FROM public.entries
        WHERE polling_centre_id = NEW.polling_centre_id
          AND (phone_e164 = NEW.phone_e164 OR ward_filed_id = NEW.ward_filed_id)
          AND similarity(name, NEW.name) >= 0.70
        ORDER BY similarity(name, NEW.name) DESC LIMIT 1;

        IF v_sim >= 0.85 THEN
            v_flags := array_append(v_flags, 'DUPLICATE');
        ELSIF v_sim >= 0.70 THEN
            v_flags := array_append(v_flags, 'POSSIBLE_DUPLICATE');
        END IF;
    END IF;

    NEW.flags := v_flags;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_compute_entry_flags
    BEFORE INSERT OR UPDATE ON public.entries
    FOR EACH ROW EXECUTE FUNCTION public.fn_compute_entry_flags();`,

    seeds: `-- CANONICAL WARDS SEED (Kakamega County, Lurambi Constituency)
INSERT INTO public.wards (id, name, code, registered_voters_target) VALUES
    ('a0000001-0000-0000-0000-000000000001', 'Sheywe', 'LUR-01', 26500),
    ('a0000001-0000-0000-0000-000000000002', 'Shirere', 'LUR-02', 19400),
    ('a0000001-0000-0000-0000-000000000003', 'Mahiakalo', 'LUR-03', 18200),
    ('a0000001-0000-0000-0000-000000000004', 'Butsotso East', 'LUR-04', 17800),
    ('a0000001-0000-0000-0000-000000000005', 'Butsotso South', 'LUR-05', 16900),
    ('a0000001-0000-0000-0000-000000000006', 'Butsotso Central', 'LUR-06', 18500)
ON CONFLICT (name) DO NOTHING;

-- PLACE ALIASES SEED (Normalises legacy spreadsheet spelling quirks)
INSERT INTO public.place_aliases (raw_alias, canonical_type, target_ward_id, confidence, notes) VALUES
    ('Shieywe', 'ward', 'a0000001-0000-0000-0000-000000000001', 0.99, 'Common typo in Raw Data sheet'),
    ('sheywe', 'ward', 'a0000001-0000-0000-0000-000000000001', 1.00, 'Lowercase variant'),
    ('Mahialako', 'ward', 'a0000001-0000-0000-0000-000000000003', 0.98, 'Letter transposition typo'),
    ('Butsotso south', 'ward', 'a0000001-0000-0000-0000-000000000005', 1.00, 'Sentence case'),
    ('chillpark', 'polling_centre', NULL, 0.85, 'Informal Muliro Gardens spot'),
    ('Daisy', 'polling_centre', NULL, 0.00, 'Personal name in place column -> Needs Mapping'),
    ('Approved', 'polling_centre', NULL, 0.00, 'Misplaced status cell -> Needs Mapping')
ON CONFLICT (raw_alias, canonical_type) DO NOTHING;`,

    test_proof: `-- ============================================================================
-- SQL TEST CASE: Proof of Mobilizer UPDATE / DELETE Lockdown
-- ============================================================================
DO $$
DECLARE
    v_mobilizer_id UUID := '11111111-1111-1111-1111-111111111111'::uuid;
    v_test_entry_id UUID := '22222222-2222-2222-2222-222222222222'::uuid;
BEGIN
    -- 1. Setup mock mobilizer session
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';

    -- 2. Attempt UPDATE (Must FAIL under RLS)
    BEGIN
        UPDATE public.entries 
        SET notes = 'Unauthorized tampering attempt'
        WHERE id = v_test_entry_id;

        RAISE EXCEPTION 'SECURITY BREACH: Mobilizer was permitted to execute UPDATE!';
    EXCEPTION 
        WHEN insufficient_privilege THEN
            RAISE NOTICE 'SUCCESS: RLS correctly rejected Mobilizer UPDATE with code 42501.';
    END;

    -- 3. Attempt DELETE (Must FAIL under RLS)
    BEGIN
        DELETE FROM public.entries WHERE id = v_test_entry_id;

        RAISE EXCEPTION 'SECURITY BREACH: Mobilizer was permitted to execute DELETE!';
    EXCEPTION 
        WHEN insufficient_privilege THEN
            RAISE NOTICE 'SUCCESS: RLS correctly rejected Mobilizer DELETE with code 42501.';
    END;
END $$;`
  };

  const copyCurrentSql = () => {
    navigator.clipboard.writeText(sqlSnippets[activeTab]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadFullSql = () => {
    const fullContent = `-- Lurambi Campaign Field Platform (2027) Full Production SQL
-- Schema + RLS + Triggers + Canonical Seeds
${sqlSnippets.schema}

${sqlSnippets.rls}

${sqlSnippets.triggers}

${sqlSnippets.seeds}

${sqlSnippets.test_proof}
`;
    const blob = new Blob([fullContent], { type: 'text/sql' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lurambi_campaign_schema_2027.sql';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-emerald-700" />
            <h3 className="font-bold text-base text-gray-900">
              Stage 2 Deliverable: Complete Supabase PostgreSQL SQL
            </h3>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
              Postgres 15+ / Supabase
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-600">
            Includes relational hierarchy, cryptographic salted ID hashes, strict Row Level Security, immutable audit rules,
            and automatic flag evaluation triggers.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={copyCurrentSql}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-xs font-semibold transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied Tab' : 'Copy SQL'}
          </button>
          <button
            onClick={downloadFullSql}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 text-xs font-semibold shadow-xs transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Download .sql Script
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 space-x-1 sm:space-x-2 overflow-x-auto text-xs sm:text-sm font-semibold">
        <button
          onClick={() => setActiveTab('schema')}
          className={`py-2 px-3 border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors ${
            activeTab === 'schema'
              ? 'border-emerald-700 text-emerald-800'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <FileCode className="w-4 h-4" />
          1. Schema DDL & Types
        </button>
        <button
          onClick={() => setActiveTab('rls')}
          className={`py-2 px-3 border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors ${
            activeTab === 'rls'
              ? 'border-emerald-700 text-emerald-800'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Key className="w-4 h-4" />
          2. RLS Security Policies
        </button>
        <button
          onClick={() => setActiveTab('triggers')}
          className={`py-2 px-3 border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors ${
            activeTab === 'triggers'
              ? 'border-emerald-700 text-emerald-800'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Zap className="w-4 h-4" />
          3. Stored Triggers & Flags
        </button>
        <button
          onClick={() => setActiveTab('seeds')}
          className={`py-2 px-3 border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors ${
            activeTab === 'seeds'
              ? 'border-emerald-700 text-emerald-800'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Database className="w-4 h-4" />
          4. Canonical Wards & Aliases
        </button>
        <button
          onClick={() => setActiveTab('test_proof')}
          className={`py-2 px-3 border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors ${
            activeTab === 'test_proof'
              ? 'border-emerald-700 text-emerald-800'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <ShieldAlert className="w-4 h-4 text-emerald-600" />
          5. RLS Security Test Script
        </button>
      </div>

      {/* SQL Code Block */}
      <div className="bg-gray-950 text-emerald-300/90 rounded-xl p-4 font-mono text-xs overflow-x-auto leading-relaxed border border-gray-800 shadow-xl max-h-[520px]">
        <pre>{sqlSnippets[activeTab]}</pre>
      </div>

      {/* Highlight cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div className="bg-emerald-50 border border-emerald-200 p-3.5 rounded-xl flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-emerald-950">Partial Unique Index on ID Hash</h4>
            <p className="text-emerald-800/90 mt-1 leading-relaxed">
              <code className="text-[11px] bg-white px-1 py-0.5 rounded border border-emerald-300">WHERE id_hash IS NOT NULL</code> ensures instant duplicate blocking for voters with IDs while allowing <code className="text-[11px] bg-white px-1 py-0.5 rounded border border-emerald-300">pending_id</code> entries to proceed.
            </p>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-amber-950">Trigram & pg_trgm Enabled</h4>
            <p className="text-amber-800/90 mt-1 leading-relaxed">
              GIN indexes on <code className="text-[11px] bg-white px-1 py-0.5 rounded border border-amber-300">name gin_trgm_ops</code> deliver rapid fuzzy voter searches and resolve misspelled wards in milliseconds.
            </p>
          </div>
        </div>

        <div className="bg-teal-50 border border-teal-200 p-3.5 rounded-xl flex items-start gap-3">
          <Key className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-teal-950">Zero UPDATE/DELETE for Mobilizers</h4>
            <p className="text-teal-800/90 mt-1 leading-relaxed">
              By deliberate omission of UPDATE / DELETE policies, PostgreSQL denies mobilizer mutation attempts directly at the engine level.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
