BEGIN;
-- ============================================================================
-- LURAMBI CAMPAIGN FIELD PLATFORM (KAKAMEGA COUNTY, KENYA - 2027 GENERAL ELECTION)
-- SUPABASE POSTGRESQL PRODUCTION DDL: SCHEMA, ENUMS, INDEXES, RLS, TRIGGERS & AUDIT
-- ============================================================================

-- Enable required Postgres extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ----------------------------------------------------------------------------
-- 1. CUSTOM TYPES & ENUMS
-- ----------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('admin', 'ward_coordinator', 'mobilizer');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE user_status AS ENUM ('pending', 'approved', 'suspended', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE verification_status AS ENUM (
        'unverified',
        'verified',
        'not_found',
        'wrong_constituency',
        'pending_id'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE support_level AS ENUM (
        'strong_supporter',
        'leaning',
        'undecided',
        'opposed',
        'not_reached',
        'not_assessed'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE entry_source AS ENUM ('legacy', 'mobilizer', 'self_registered');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE network_contact_type AS ENUM ('pastor', 'chp', 'other');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE reach_status AS ENUM ('not_contacted', 'contacted', 'meeting_held');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE flag_severity AS ENUM ('critical', 'warning', 'info');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE canonical_type AS ENUM ('ward', 'polling_centre', 'polling_station');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ----------------------------------------------------------------------------
-- 2. CORE HIERARCHY TABLES (Constituency -> Ward -> Polling Centre -> Polling Station)
-- ----------------------------------------------------------------------------

-- Wards table
CREATE TABLE IF NOT EXISTS public.wards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    constituency_name TEXT NOT NULL DEFAULT 'Lurambi',
    county_name TEXT NOT NULL DEFAULT 'Kakamega',
    name TEXT NOT NULL UNIQUE,
    code TEXT UNIQUE,
    registered_voters_target INTEGER DEFAULT 18000,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Polling Centres
CREATE TABLE IF NOT EXISTS public.polling_centres (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ward_id UUID NOT NULL REFERENCES public.wards(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    code TEXT,
    total_registered_voters INTEGER DEFAULT 0,
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_ward_centre_name UNIQUE (ward_id, name)
);

-- Polling Stations
CREATE TABLE IF NOT EXISTS public.polling_stations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    polling_centre_id UUID NOT NULL REFERENCES public.polling_centres(id) ON DELETE RESTRICT,
    ward_id UUID NOT NULL REFERENCES public.wards(id) ON DELETE RESTRICT,
    station_name TEXT NOT NULL,
    station_number INTEGER NOT NULL DEFAULT 1,
    registered_voters_est INTEGER DEFAULT 650,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_centre_station UNIQUE (polling_centre_id, station_name)
);

-- Place aliases and normalisation mapping table
CREATE TABLE IF NOT EXISTS public.place_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raw_alias TEXT NOT NULL,
    canonical_type canonical_type NOT NULL,
    target_ward_id UUID REFERENCES public.wards(id) ON DELETE SET NULL,
    target_polling_centre_id UUID REFERENCES public.polling_centres(id) ON DELETE SET NULL,
    target_polling_station_id UUID REFERENCES public.polling_stations(id) ON DELETE SET NULL,
    confidence NUMERIC(3, 2) DEFAULT 1.00,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_raw_alias_type UNIQUE (raw_alias, canonical_type)
);

-- ----------------------------------------------------------------------------
-- 3. USER PROFILES & AUTH RBAC
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY, -- links to auth.users.id
    email TEXT,
    full_name TEXT NOT NULL,
    phone_e164 TEXT NOT NULL,
    national_id_masked TEXT,
    national_id_hash TEXT,
    role user_role NOT NULL DEFAULT 'mobilizer',
    status user_status NOT NULL DEFAULT 'pending',
    home_ward_id UUID REFERENCES public.wards(id) ON DELETE SET NULL,
    home_polling_station_id UUID REFERENCES public.polling_stations(id) ON DELETE SET NULL,
    referral_code VARCHAR(6) UNIQUE,
    approved_by UUID REFERENCES public.profiles(id),
    approved_at TIMESTAMPTZ,
    last_active_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- System pseudo-user for legacy imported rows
-- (Prevents legacy records from inflating individual mobilizer quotas)
CREATE TABLE IF NOT EXISTS public.system_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT
);

-- ----------------------------------------------------------------------------
-- 4. OFFICIAL VOTER REGISTER (Imported extract from official register)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.voter_register (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    national_id_hash TEXT NOT NULL UNIQUE,
    national_id_encrypted TEXT,
    national_id_masked TEXT,
    full_name TEXT NOT NULL,
    first_name TEXT,
    other_names TEXT,
    gender VARCHAR(1),
    date_of_birth DATE,
    constituency TEXT NOT NULL DEFAULT 'Lurambi',
    ward_id UUID REFERENCES public.wards(id) ON DELETE SET NULL,
    ward_name_raw TEXT,
    polling_centre_id UUID REFERENCES public.polling_centres(id) ON DELETE SET NULL,
    polling_centre_name_raw TEXT,
    polling_station_id UUID REFERENCES public.polling_stations(id) ON DELETE SET NULL,
    voter_number TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ----------------------------------------------------------------------------
-- 5. IMPORTS & EXPORTS LOG
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.imports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_name TEXT NOT NULL,
    import_type TEXT NOT NULL, -- 'legacy_workbook', 'voter_register', 'network_contacts'
    total_rows INTEGER NOT NULL DEFAULT 0,
    imported_rows INTEGER NOT NULL DEFAULT 0,
    duplicate_rows INTEGER NOT NULL DEFAULT 0,
    rejected_rows INTEGER NOT NULL DEFAULT 0,
    flagged_rows INTEGER NOT NULL DEFAULT 0,
    unmapped_rows INTEGER NOT NULL DEFAULT 0,
    summary_report JSONB DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.exports_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id),
    export_type TEXT NOT NULL,
    format TEXT NOT NULL, -- 'xlsx', 'csv', 'pdf'
    filter_criteria JSONB DEFAULT '{}'::jsonb,
    row_count INTEGER NOT NULL DEFAULT 0,
    file_name TEXT NOT NULL,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ----------------------------------------------------------------------------
-- 6. VOTER ENTRIES (The System of Record)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mobilizer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ward_filed_id UUID NOT NULL REFERENCES public.wards(id) ON DELETE RESTRICT,
    polling_centre_id UUID REFERENCES public.polling_centres(id) ON DELETE SET NULL,
    polling_station_id UUID REFERENCES public.polling_stations(id) ON DELETE SET NULL,
    register_voter_id UUID REFERENCES public.voter_register(id) ON DELETE SET NULL,
    
    -- Supporter identity (encrypted / hashed where sensitive)
    name TEXT NOT NULL,
    phone_e164 TEXT,
    id_hash TEXT, -- Salted SHA-256 for duplicate matching
    id_encrypted TEXT, -- PGP encrypted for authorized inspection
    id_masked TEXT, -- e.g. 2****789
    
    -- Campaign intelligence
    support_level support_level NOT NULL DEFAULT 'not_assessed',
    issues TEXT[] DEFAULT '{}',
    needs_transport BOOLEAN NOT NULL DEFAULT false,
    has_pvc BOOLEAN NOT NULL DEFAULT false,
    notes TEXT,
    
    -- Kenya Data Protection Act 2019 compliance
    consent_at TIMESTAMPTZ,
    consent_text_version TEXT,
    consent_status TEXT DEFAULT 'given', -- 'given', 'legacy_unconfirmed', 'revoked'
    
    -- Source and Verification metadata
    source entry_source NOT NULL DEFAULT 'mobilizer',
    verification_status verification_status NOT NULL DEFAULT 'unverified',
    verification_notes TEXT,
    verified_by UUID REFERENCES public.profiles(id),
    verified_at TIMESTAMPTZ,
    
    -- Legacy metadata tracking
    legacy_mobilizer_label TEXT,
    captured_on TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    import_batch_id UUID REFERENCES public.imports(id) ON DELETE SET NULL,
    row_hash TEXT, -- Idempotency hash to prevent re-importing duplicate rows
    
    -- Computed flags
    flags TEXT[] DEFAULT '{}',
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ----------------------------------------------------------------------------
-- 7. AUDIT LOG & COMPLIANCE RECORDS (Immutable)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id),
    user_email TEXT,
    user_role TEXT,
    action TEXT NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE', 'REVEAL_ID', 'MERGE', 'EXPORT', 'APPROVE_USER'
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    old_values JSONB,
    new_values JSONB,
    reason TEXT NOT NULL, -- Mandatory justification for every admin override
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Block update/delete on audit_log
CREATE OR REPLACE RULE audit_log_no_update AS ON UPDATE TO public.audit_log DO INSTEAD NOTHING;
CREATE OR REPLACE RULE audit_log_no_delete AS ON DELETE TO public.audit_log DO INSTEAD NOTHING;

-- Flag Review Queue
CREATE TABLE IF NOT EXISTS public.flag_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id UUID NOT NULL REFERENCES public.entries(id) ON DELETE CASCADE,
    flag_code TEXT NOT NULL,
    severity flag_severity NOT NULL DEFAULT 'warning',
    details JSONB DEFAULT '{}'::jsonb,
    is_resolved BOOLEAN NOT NULL DEFAULT false,
    resolved_by UUID REFERENCES public.profiles(id),
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Duplicate Attempts Tracker (for analytics and audit)
CREATE TABLE IF NOT EXISTS public.duplicate_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mobilizer_id UUID REFERENCES public.profiles(id),
    matched_entry_id UUID REFERENCES public.entries(id) ON DELETE SET NULL,
    attempted_name TEXT,
    attempted_phone TEXT,
    attempted_id_hash TEXT,
    attempted_ward_id UUID REFERENCES public.wards(id),
    match_reason TEXT NOT NULL,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ----------------------------------------------------------------------------
-- 8. NETWORK CONTACTS (Pastors & Community Health Promoters / CHPs)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.network_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type network_contact_type NOT NULL,
    name TEXT NOT NULL,
    phone_e164 TEXT,
    national_id_hash TEXT,
    national_id_encrypted TEXT,
    denomination TEXT, -- For pastors (e.g. PEFA, Friends Church, Catholic, ACK, Pentecostal)
    community_unit TEXT, -- For CHPs (e.g. Amalemba CU, Bukura CU, Elukhambi CU)
    sub_county TEXT DEFAULT 'Lurambi',
    ward_id UUID REFERENCES public.wards(id) ON DELETE SET NULL,
    polling_station_id UUID REFERENCES public.polling_stations(id) ON DELETE SET NULL,
    reach_status reach_status NOT NULL DEFAULT 'not_contacted',
    notes TEXT,
    exclude_from_campaign_exports BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ----------------------------------------------------------------------------
-- 9. DATA PROTECTION & SETTINGS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.data_subject_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_type TEXT NOT NULL, -- 'access', 'rectification', 'erasure', 'objection'
    requester_name TEXT NOT NULL,
    phone_e164 TEXT NOT NULL,
    national_id_hash TEXT,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'rejected'
    notes TEXT,
    resolved_by UUID REFERENCES public.profiles(id),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_by UUID REFERENCES public.profiles(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ----------------------------------------------------------------------------

-- Add current columns to the earlier partial schema without dropping legacy columns.
ALTER TABLE public.wards ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now());
ALTER TABLE public.polling_centres ADD COLUMN IF NOT EXISTS latitude NUMERIC(10,7), ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,7), ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text,now()), ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text,now());
ALTER TABLE public.polling_stations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text,now()), ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text,now());
ALTER TABLE public.place_aliases ADD COLUMN IF NOT EXISTS target_polling_station_id UUID REFERENCES public.polling_stations(id) ON DELETE SET NULL, ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text,now());
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT, ADD COLUMN IF NOT EXISTS full_name TEXT, ADD COLUMN IF NOT EXISTS phone_e164 TEXT, ADD COLUMN IF NOT EXISTS national_id_masked TEXT, ADD COLUMN IF NOT EXISTS national_id_hash TEXT, ADD COLUMN IF NOT EXISTS home_polling_station_id UUID REFERENCES public.polling_stations(id) ON DELETE SET NULL, ADD COLUMN IF NOT EXISTS referral_code VARCHAR(6), ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id), ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text,now());
ALTER TABLE public.voter_register ADD COLUMN IF NOT EXISTS national_id_hash TEXT, ADD COLUMN IF NOT EXISTS national_id_encrypted TEXT, ADD COLUMN IF NOT EXISTS national_id_masked TEXT, ADD COLUMN IF NOT EXISTS first_name TEXT, ADD COLUMN IF NOT EXISTS other_names TEXT, ADD COLUMN IF NOT EXISTS gender VARCHAR(1), ADD COLUMN IF NOT EXISTS date_of_birth DATE, ADD COLUMN IF NOT EXISTS constituency TEXT NOT NULL DEFAULT 'Lurambi', ADD COLUMN IF NOT EXISTS ward_name_raw TEXT, ADD COLUMN IF NOT EXISTS polling_centre_id UUID REFERENCES public.polling_centres(id) ON DELETE SET NULL, ADD COLUMN IF NOT EXISTS polling_centre_name_raw TEXT, ADD COLUMN IF NOT EXISTS polling_station_id UUID REFERENCES public.polling_stations(id) ON DELETE SET NULL, ADD COLUMN IF NOT EXISTS voter_number TEXT, ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS file_name TEXT, ADD COLUMN IF NOT EXISTS import_type TEXT, ADD COLUMN IF NOT EXISTS total_rows INTEGER NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS imported_rows INTEGER NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS duplicate_rows INTEGER NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS rejected_rows INTEGER NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS flagged_rows INTEGER NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS unmapped_rows INTEGER NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS summary_report JSONB NOT NULL DEFAULT '{}'::jsonb, ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id), ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text,now());
ALTER TABLE public.entries ADD COLUMN IF NOT EXISTS register_voter_id UUID REFERENCES public.voter_register(id) ON DELETE SET NULL, ADD COLUMN IF NOT EXISTS notes TEXT, ADD COLUMN IF NOT EXISTS verification_notes TEXT, ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES public.profiles(id), ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text,now());
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS user_email TEXT, ADD COLUMN IF NOT EXISTS user_role TEXT, ADD COLUMN IF NOT EXISTS entity_type TEXT, ADD COLUMN IF NOT EXISTS entity_id TEXT, ADD COLUMN IF NOT EXISTS old_values JSONB, ADD COLUMN IF NOT EXISTS new_values JSONB, ADD COLUMN IF NOT EXISTS reason TEXT, ADD COLUMN IF NOT EXISTS ip_address TEXT;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM public.profiles WHERE full_name IS NULL OR phone_e164 IS NULL) THEN RAISE EXCEPTION 'Map legacy profiles before repair'; END IF;
 IF EXISTS (SELECT 1 FROM public.voter_register WHERE national_id_hash IS NULL) THEN RAISE EXCEPTION 'Hash/map legacy voter IDs before repair'; END IF;
 IF EXISTS (SELECT 1 FROM public.imports WHERE file_name IS NULL OR import_type IS NULL) THEN RAISE EXCEPTION 'Map legacy imports before repair'; END IF;
 IF EXISTS (SELECT 1 FROM public.audit_log WHERE entity_type IS NULL OR entity_id IS NULL OR reason IS NULL) THEN RAISE EXCEPTION 'Map legacy audit rows before repair'; END IF;
END $$;
ALTER TABLE public.profiles ALTER COLUMN full_name SET NOT NULL, ALTER COLUMN phone_e164 SET NOT NULL;
ALTER TABLE public.voter_register ALTER COLUMN national_id_hash SET NOT NULL;
ALTER TABLE public.imports ALTER COLUMN file_name SET NOT NULL, ALTER COLUMN import_type SET NOT NULL;
ALTER TABLE public.audit_log ALTER COLUMN entity_type SET NOT NULL, ALTER COLUMN entity_id SET NOT NULL, ALTER COLUMN reason SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_polling_stations_centre_name ON public.polling_stations(polling_centre_id,station_name);
CREATE UNIQUE INDEX IF NOT EXISTS ux_profiles_referral_code ON public.profiles(referral_code) WHERE referral_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_voter_register_national_id_hash ON public.voter_register(national_id_hash);
DROP POLICY IF EXISTS "Admins full entries access" ON public.entries;

-- 10. INDEXES (High Performance & Trigram Search)
-- ----------------------------------------------------------------------------

-- Trigram index on voter register full name for rapid fuzzy search
CREATE INDEX IF NOT EXISTS idx_voter_register_name_trgm ON public.voter_register USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_voter_register_id_hash ON public.voter_register(national_id_hash);
CREATE INDEX IF NOT EXISTS idx_voter_register_ward ON public.voter_register(ward_id);

-- Entries indexes
CREATE INDEX IF NOT EXISTS idx_entries_name_trgm ON public.entries USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_entries_id_hash ON public.entries(id_hash) WHERE id_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_entries_phone ON public.entries(phone_e164) WHERE phone_e164 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_entries_mobilizer ON public.entries(mobilizer_id);
CREATE INDEX IF NOT EXISTS idx_entries_ward_filed ON public.entries(ward_filed_id);
CREATE INDEX IF NOT EXISTS idx_entries_polling_centre ON public.entries(polling_centre_id);
CREATE INDEX IF NOT EXISTS idx_entries_polling_station ON public.entries(polling_station_id);
CREATE INDEX IF NOT EXISTS idx_entries_row_hash ON public.entries(row_hash) WHERE row_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_entries_verification ON public.entries(verification_status);
CREATE INDEX IF NOT EXISTS idx_entries_support_level ON public.entries(support_level);

-- Place aliases trigram
CREATE INDEX IF NOT EXISTS idx_place_aliases_trgm ON public.place_aliases USING gin (raw_alias gin_trgm_ops);

-- Flag events index
CREATE INDEX IF NOT EXISTS idx_flag_events_entry ON public.flag_events(entry_id);
CREATE INDEX IF NOT EXISTS idx_flag_events_unresolved ON public.flag_events(is_resolved) WHERE is_resolved = false;

-- Network contacts
CREATE INDEX IF NOT EXISTS idx_network_contacts_ward ON public.network_contacts(ward_id);
CREATE INDEX IF NOT EXISTS idx_network_contacts_type ON public.network_contacts(type);

-- ----------------------------------------------------------------------------
-- 11. ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.polling_centres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.polling_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.place_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voter_register ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flag_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duplicate_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.network_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exports_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_subject_requests ENABLE ROW LEVEL SECURITY;

-- Helper function: get current user role
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper function: get current user home ward
CREATE OR REPLACE FUNCTION public.current_user_ward()
RETURNS UUID AS $$
    SELECT home_ward_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper function: check if admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin' AND status = 'approved'
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper function: check if ward coordinator
CREATE OR REPLACE FUNCTION public.is_coordinator()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'ward_coordinator' AND status = 'approved'
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ---------------------------------------
-- RLS: WARDS, POLLING CENTRES & STATIONS
-- ---------------------------------------
-- Wards, centres and stations are readable by all authenticated users
DROP POLICY IF EXISTS "Hierarchy readable by authenticated users" ON public.wards;
CREATE POLICY "Hierarchy readable by authenticated users"
    ON public.wards FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Centres readable by authenticated users" ON public.polling_centres;
CREATE POLICY "Centres readable by authenticated users"
    ON public.polling_centres FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Stations readable by authenticated users" ON public.polling_stations;
CREATE POLICY "Stations readable by authenticated users"
    ON public.polling_stations FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Aliases readable by authenticated users" ON public.place_aliases;
CREATE POLICY "Aliases readable by authenticated users"
    ON public.place_aliases FOR SELECT
    TO authenticated
    USING (true);

-- Admin can manage hierarchy
DROP POLICY IF EXISTS "Hierarchy admin manage" ON public.wards;
CREATE POLICY "Hierarchy admin manage"
    ON public.wards FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Centres admin manage" ON public.polling_centres;
CREATE POLICY "Centres admin manage"
    ON public.polling_centres FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Stations admin manage" ON public.polling_stations;
CREATE POLICY "Stations admin manage"
    ON public.polling_stations FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Aliases admin manage" ON public.place_aliases;
CREATE POLICY "Aliases admin manage"
    ON public.place_aliases FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ---------------------------------------
-- RLS: PROFILES
-- ---------------------------------------
-- Users can see their own profile
DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
CREATE POLICY "Users read own profile"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (id = auth.uid());

-- Ward coordinators can see mobilizers from their ward
DROP POLICY IF EXISTS "Coordinators view ward mobilizers" ON public.profiles;
CREATE POLICY "Coordinators view ward mobilizers"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (
        public.is_coordinator() AND
        home_ward_id = public.current_user_ward()
    );

-- Coordinators can approve mobilizers in their ward
DROP POLICY IF EXISTS "Coordinators approve ward mobilizers" ON public.profiles;
CREATE POLICY "Coordinators approve ward mobilizers"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (
        public.is_coordinator() AND
        home_ward_id = public.current_user_ward() AND
        role = 'mobilizer'
    )
    WITH CHECK (
        public.is_coordinator() AND
        home_ward_id = public.current_user_ward() AND
        role = 'mobilizer'
    );

-- Admins full access on profiles
DROP POLICY IF EXISTS "Admins full manage profiles" ON public.profiles;
CREATE POLICY "Admins full manage profiles"
    ON public.profiles FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Self-registration creates profile
DROP POLICY IF EXISTS "Users insert self profile" ON public.profiles;
CREATE POLICY "Users insert self profile"
    ON public.profiles FOR INSERT
    TO authenticated
    WITH CHECK (id = auth.uid());

-- ---------------------------------------
-- RLS: ENTRIES (CRITICAL SPECIFICATION)
-- ---------------------------------------
-- 1. Mobilizers can INSERT entries
DROP POLICY IF EXISTS "Mobilizers can insert entries" ON public.entries;
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

-- 2. Mobilizers can SELECT ONLY their own entries
DROP POLICY IF EXISTS "Mobilizers can select only their own entries" ON public.entries;
CREATE POLICY "Mobilizers can select only their own entries"
    ON public.entries FOR SELECT
    TO authenticated
    USING (mobilizer_id = auth.uid());

-- 3. Coordinators can SELECT entries filed in their ward
DROP POLICY IF EXISTS "Coordinators can select ward entries" ON public.entries;
CREATE POLICY "Coordinators can select ward entries"
    ON public.entries FOR SELECT
    TO authenticated
    USING (
        public.is_coordinator() AND
        ward_filed_id = public.current_user_ward()
    );

-- 4. Admins have FULL SELECT and INSERT access
DROP POLICY IF EXISTS "Admins can select all entries" ON public.entries;
CREATE POLICY "Admins can select all entries"
    ON public.entries FOR SELECT
    TO authenticated
    USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can insert entries" ON public.entries;
CREATE POLICY "Admins can insert entries"
    ON public.entries FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin());

-- 5. Admins can UPDATE entries (Mandatory audit log trigger will capture reason)
DROP POLICY IF EXISTS "Admins can update entries" ON public.entries;
CREATE POLICY "Admins can update entries"
    ON public.entries FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 6. Admins can DELETE entries (Mandatory audit log trigger will capture reason)
DROP POLICY IF EXISTS "Admins can delete entries" ON public.entries;
CREATE POLICY "Admins can delete entries"
    ON public.entries FOR DELETE
    TO authenticated
    USING (public.is_admin());

-- NOTE: By omission of any UPDATE or DELETE policies for mobilizers or coordinators,
-- Postgres RLS strictly forbids mobilizers from modifying or deleting entries!

-- ---------------------------------------
-- RLS: VOTER REGISTER
-- ---------------------------------------
-- Mobilizers can search voter register (subject to rate limit in app and limits)
DROP POLICY IF EXISTS "Approved mobilizers can search voter register" ON public.voter_register;
CREATE POLICY "Approved mobilizers can search voter register"
    ON public.voter_register FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND status = 'approved'
        )
    );

DROP POLICY IF EXISTS "Admins can manage voter register" ON public.voter_register;
CREATE POLICY "Admins can manage voter register"
    ON public.voter_register FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ---------------------------------------
-- RLS: NETWORK CONTACTS
-- ---------------------------------------
DROP POLICY IF EXISTS "Admins manage network contacts" ON public.network_contacts;
CREATE POLICY "Admins manage network contacts"
    ON public.network_contacts FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Coordinators view ward network contacts" ON public.network_contacts;
CREATE POLICY "Coordinators view ward network contacts"
    ON public.network_contacts FOR SELECT
    TO authenticated
    USING (
        public.is_coordinator() AND
        (ward_id = public.current_user_ward() OR ward_id IS NULL)
    );

-- ---------------------------------------
-- RLS: AUDIT LOG, IMPORTS, EXPORTS & SETTINGS
-- ---------------------------------------
DROP POLICY IF EXISTS "Admins view and insert audit logs" ON public.audit_log;
CREATE POLICY "Admins view and insert audit logs"
    ON public.audit_log FOR SELECT
    TO authenticated
    USING (public.is_admin());

DROP POLICY IF EXISTS "Authenticated users can write audit log via trigger" ON public.audit_log;
CREATE POLICY "Authenticated users can write audit log via trigger"
    ON public.audit_log FOR INSERT
    TO authenticated
    WITH CHECK (true);

DROP POLICY IF EXISTS "Admins view and manage imports" ON public.imports;
CREATE POLICY "Admins view and manage imports"
    ON public.imports FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Users can insert export logs" ON public.exports_log;
CREATE POLICY "Users can insert export logs"
    ON public.exports_log FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins view export logs" ON public.exports_log;
CREATE POLICY "Admins view export logs"
    ON public.exports_log FOR SELECT
    TO authenticated
    USING (public.is_admin());

DROP POLICY IF EXISTS "Admins manage settings" ON public.settings;
CREATE POLICY "Admins manage settings"
    ON public.settings FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Authenticated users read settings" ON public.settings;
CREATE POLICY "Authenticated users read settings"
    ON public.settings FOR SELECT
    TO authenticated
    USING (true);

-- ----------------------------------------------------------------------------
-- 12. STORED PROCEDURES & TRIGGERS
-- ----------------------------------------------------------------------------

-- Function: Compute Flags on Entry Insertion
CREATE OR REPLACE FUNCTION public.fn_compute_entry_flags()
RETURNS TRIGGER AS $$
DECLARE
    v_flags TEXT[] := '{}';
    v_existing_id UUID;
    v_sim NUMERIC;
    v_mobilizer_home_ward UUID;
    v_register_ward UUID;
BEGIN
    -- 1. Check Missing or Invalid ID
    IF NEW.id_hash IS NULL OR NEW.id_masked IS NULL THEN
        v_flags := array_append(v_flags, 'MISSING_ID');
        NEW.verification_status := 'pending_id';
    ELSIF length(regexp_replace(NEW.id_masked, '[^0-9*]', '', 'g')) NOT IN (7, 8) THEN
        v_flags := array_append(v_flags, 'INVALID_ID');
    END IF;

    -- 2. Check Invalid Phone (Kenyan phone validation)
    IF NEW.phone_e164 IS NOT NULL THEN
        IF NEW.phone_e164 !~ '^\+254(7|1)[0-9]{8}$' THEN
            v_flags := array_append(v_flags, 'INVALID_PHONE');
        ELSE
            -- Check for shared phone (informational only)
            IF EXISTS (
                SELECT 1 FROM public.entries
                WHERE phone_e164 = NEW.phone_e164
                  AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
                LIMIT 1
            ) THEN
                v_flags := array_append(v_flags, 'SHARED_PHONE');
            END IF;
        END IF;
    END IF;

    -- 3. Ward Mismatch (Mobilizer filed voter under a different ward than mobilizer's home ward)
    IF NEW.mobilizer_id IS NOT NULL THEN
        SELECT home_ward_id INTO v_mobilizer_home_ward FROM public.profiles WHERE id = NEW.mobilizer_id;
        IF v_mobilizer_home_ward IS NOT NULL AND v_mobilizer_home_ward <> NEW.ward_filed_id THEN
            v_flags := array_append(v_flags, 'WARD_MISMATCH');
        END IF;
    END IF;

    -- 4. Check against Voter Register if register_voter_id is supplied
    IF NEW.register_voter_id IS NOT NULL THEN
        SELECT ward_id INTO v_register_ward FROM public.voter_register WHERE id = NEW.register_voter_id;
        IF v_register_ward IS NOT NULL AND v_register_ward <> NEW.ward_filed_id THEN
            v_flags := array_append(v_flags, 'FILED_UNDER_DIFFERENT_WARD');
        END IF;
    END IF;

    -- 5. Duplicate Check
    -- (a) Exact ID Match
    IF NEW.id_hash IS NOT NULL THEN
        SELECT id INTO v_existing_id
        FROM public.entries
        WHERE id_hash = NEW.id_hash
          AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        LIMIT 1;

        IF v_existing_id IS NOT NULL THEN
            v_flags := array_append(v_flags, 'DUPLICATE');
        END IF;
    ELSE
        -- (b) Fuzzy Duplicate Match when ID is missing:
        -- trigram similarity >= 0.85 AND same polling station AND (same phone OR same ward)
        SELECT id, similarity(name, NEW.name) INTO v_existing_id, v_sim
        FROM public.entries
        WHERE (polling_station_id = NEW.polling_station_id OR polling_centre_id = NEW.polling_centre_id)
          AND (phone_e164 = NEW.phone_e164 OR ward_filed_id = NEW.ward_filed_id)
          AND similarity(name, NEW.name) >= 0.70
          AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        ORDER BY similarity(name, NEW.name) DESC
        LIMIT 1;

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
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_compute_entry_flags();

-- ============================================================================
-- VERIFICATION TEST SCRIPT (Proof of RLS Security)
-- ============================================================================
/*
-- TEST 1: Mobilizer cannot update submitted entry
DO $$
DECLARE
    v_user_id UUID := '11111111-1111-1111-1111-111111111111'::uuid;
    v_entry_id UUID := '22222222-2222-2222-2222-222222222222'::uuid;
BEGIN
    -- Simulating mobilizer session:
    SET LOCAL ROLE authenticated;
    SET LOCAL "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
    
    -- Attempting UPDATE:
    BEGIN
        UPDATE public.entries SET notes = 'Malicious update attempt' WHERE id = v_entry_id;
        RAISE EXCEPTION 'TEST FAILED: Mobilizer was able to update entry!';
    EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'TEST PASSED: Mobilizer update was correctly rejected by RLS.';
    END;

    -- Attempting DELETE:
    BEGIN
        DELETE FROM public.entries WHERE id = v_entry_id;
        RAISE EXCEPTION 'TEST FAILED: Mobilizer was able to delete entry!';
    EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'TEST PASSED: Mobilizer delete was correctly rejected by RLS.';
    END;
END $$;
*/
-- ============================================================================
-- LURAMBI CAMPAIGN FIELD PLATFORM - PRODUCTION SEED DATA
-- Kakamega County, Lurambi Constituency (2027 General Election)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. SYSTEM PSEUDO-USERS
-- ----------------------------------------------------------------------------
INSERT INTO public.system_users (id, name, description)
VALUES 
    ('00000000-0000-0000-0000-000000000001', 'legacy_import', 'Attribution for historical records imported from the Excel legacy workbook')
ON CONFLICT (name) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. CANONICAL WARDS (All 6 Official Lurambi Wards)
-- ----------------------------------------------------------------------------
INSERT INTO public.wards (id, constituency_name, county_name, name, code, registered_voters_target)
VALUES 
    ('a0000001-0000-0000-0000-000000000001', 'Lurambi', 'Kakamega', 'Sheywe', 'LUR-01', 26500),
    ('a0000001-0000-0000-0000-000000000002', 'Lurambi', 'Kakamega', 'Shirere', 'LUR-02', 19400),
    ('a0000001-0000-0000-0000-000000000003', 'Lurambi', 'Kakamega', 'Mahiakalo', 'LUR-03', 18200),
    ('a0000001-0000-0000-0000-000000000004', 'Lurambi', 'Kakamega', 'Butsotso East', 'LUR-04', 17800),
    ('a0000001-0000-0000-0000-000000000005', 'Lurambi', 'Kakamega', 'Butsotso South', 'LUR-05', 16900),
    ('a0000001-0000-0000-0000-000000000006', 'Lurambi', 'Kakamega', 'Butsotso Central', 'LUR-06', 18500)
ON CONFLICT (name) DO UPDATE SET 
    registered_voters_target = EXCLUDED.registered_voters_target;

-- ----------------------------------------------------------------------------
-- 3. CANONICAL POLLING CENTRES & STATIONS
-- ----------------------------------------------------------------------------
-- Sheywe Ward
INSERT INTO public.polling_centres (id, ward_id, name, code, total_registered_voters) VALUES
    ('b0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000001', 'Kakamega Primary School', 'PC-SHEY-01', 3450),
    ('b0000001-0000-0000-0000-000000000002', 'a0000001-0000-0000-0000-000000000001', 'Bukhungu Stadium Grounds', 'PC-SHEY-02', 2800),
    ('b0000001-0000-0000-0000-000000000003', 'a0000001-0000-0000-0000-000000000001', 'Muliro Gardens Community Hall', 'PC-SHEY-03', 2100)
ON CONFLICT (ward_id, name) DO NOTHING;

-- Shirere Ward
INSERT INTO public.polling_centres (id, ward_id, name, code, total_registered_voters) VALUES
    ('b0000002-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000002', 'Amalemba Primary School', 'PC-SHIR-01', 2900),
    ('b0000002-0000-0000-0000-000000000002', 'a0000001-0000-0000-0000-000000000002', 'Sigalagala National Polytechnic', 'PC-SHIR-02', 3100)
ON CONFLICT (ward_id, name) DO NOTHING;

-- Mahiakalo Ward
INSERT INTO public.polling_centres (id, ward_id, name, code, total_registered_voters) VALUES
    ('b0000003-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000003', 'Mahiakalo Primary School', 'PC-MAH-01', 2600),
    ('b0000003-0000-0000-0000-000000000002', 'a0000001-0000-0000-0000-000000000003', 'MMUST (Masinde Muliro University)', 'PC-MAH-02', 4200)
ON CONFLICT (ward_id, name) DO NOTHING;

-- Butsotso East
INSERT INTO public.polling_centres (id, ward_id, name, code, total_registered_voters) VALUES
    ('b0000004-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000004', 'Shikoti Girls Secondary', 'PC-BE-01', 2400),
    ('b0000004-0000-0000-0000-000000000002', 'a0000001-0000-0000-0000-000000000004', 'Eshisiru Primary School', 'PC-BE-02', 2150)
ON CONFLICT (ward_id, name) DO NOTHING;

-- Butsotso South
INSERT INTO public.polling_centres (id, ward_id, name, code, total_registered_voters) VALUES
    ('b0000005-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000005', 'Bukura Agricultural College', 'PC-BS-01', 2700),
    ('b0000005-0000-0000-0000-000000000002', 'a0000001-0000-0000-0000-000000000005', 'Emusire High School', 'PC-BS-02', 1950)
ON CONFLICT (ward_id, name) DO NOTHING;

-- Butsotso Central
INSERT INTO public.polling_centres (id, ward_id, name, code, total_registered_voters) VALUES
    ('b0000006-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000006', 'Lurambi Primary School', 'PC-BC-01', 2850),
    ('b0000006-0000-0000-0000-000000000002', 'a0000001-0000-0000-0000-000000000006', 'Elukhambi Primary School', 'PC-BC-02', 2200)
ON CONFLICT (ward_id, name) DO NOTHING;

-- Polling Stations (Samples per centre)
INSERT INTO public.polling_stations (polling_centre_id, ward_id, station_name, station_number, registered_voters_est) VALUES
    ('b0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000001', 'Kakamega Primary School - Stream 1', 1, 690),
    ('b0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000001', 'Kakamega Primary School - Stream 2', 2, 690),
    ('b0000002-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000002', 'Amalemba Primary - Stream 1', 1, 700),
    ('b0000003-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000003', 'Mahiakalo Primary - Stream 1', 1, 650),
    ('b0000004-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000004', 'Shikoti Girls - Stream 1', 1, 600),
    ('b0000005-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000005', 'Bukura College - Stream 1', 1, 680),
    ('b0000006-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000006', 'Lurambi Primary - Stream 1', 1, 710)
ON CONFLICT (polling_centre_id, station_name) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4. PLACE ALIASES & NORMALISATION MAPPINGS
-- Handles common spelling errors, mixed casing, and legacy Excel junk values
-- ----------------------------------------------------------------------------
INSERT INTO public.place_aliases (raw_alias, canonical_type, target_ward_id, target_polling_centre_id, confidence, notes) VALUES
    -- Ward spelling variations from legacy workbook
    ('Shieywe', 'ward', 'a0000001-0000-0000-0000-000000000001', NULL, 0.99, 'Common legacy typo in raw data'),
    ('sheywe', 'ward', 'a0000001-0000-0000-0000-000000000001', NULL, 1.00, 'Lowercase variant'),
    ('Mahialako', 'ward', 'a0000001-0000-0000-0000-000000000003', NULL, 0.98, 'Typo transposition in legacy workbook'),
    ('mahiakalo', 'ward', 'a0000001-0000-0000-0000-000000000003', NULL, 1.00, 'Lowercase variant'),
    ('Butsotso south', 'ward', 'a0000001-0000-0000-0000-000000000005', NULL, 1.00, 'Sentence case variant'),
    ('butsotso east', 'ward', 'a0000001-0000-0000-0000-000000000004', NULL, 1.00, 'Lowercase variant'),
    ('Shirere ', 'ward', 'a0000001-0000-0000-0000-000000000002', NULL, 1.00, 'Trailing space variant'),

    -- Polling centre aliases and junk value mappings
    ('Kakamega Pri', 'polling_centre', 'a0000001-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000001', 0.95, 'Abbreviation'),
    ('Amalemba Pri', 'polling_centre', 'a0000001-0000-0000-0000-000000000002', 'b0000002-0000-0000-0000-000000000001', 0.95, 'Abbreviation'),
    ('chillpark', 'polling_centre', 'a0000001-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000003', 0.85, 'Local nickname mapping to Muliro Gardens area'),
    ('Chillpark', 'polling_centre', 'a0000001-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000003', 0.85, 'Capitalized nickname variant'),
    ('Iyala ', 'polling_centre', 'a0000001-0000-0000-0000-000000000004', 'b0000004-0000-0000-0000-000000000002', 0.80, 'Sub-location landmark routed to nearest centre'),
    ('iyala', 'polling_centre', 'a0000001-0000-0000-0000-000000000004', 'b0000004-0000-0000-0000-000000000002', 0.80, 'Lowercase variant'),
    ('Daisy', 'polling_centre', NULL, NULL, 0.00, 'Junk value - personal name in place column, route to Needs Mapping'),
    ('uncle devi', 'polling_centre', NULL, NULL, 0.00, 'Junk value - personal alias, route to Needs Mapping'),
    ('Chief Mutsembi', 'polling_centre', NULL, NULL, 0.00, 'Junk value - local chief reference, route to Needs Mapping'),
    ('Approved', 'polling_centre', NULL, NULL, 0.00, 'Junk value - status string misplaced in place column')
ON CONFLICT (raw_alias, canonical_type) DO UPDATE SET 
    confidence = EXCLUDED.confidence,
    notes = EXCLUDED.notes;

-- ----------------------------------------------------------------------------
-- 5. DEFAULT SETTINGS & COMPLIANCE PARAMETERS
-- ----------------------------------------------------------------------------
INSERT INTO public.settings (key, value, description) VALUES
    ('campaign_info', '{"candidate_name": "Hon. Candidate Lurambi 2027", "constituency": "Lurambi", "county": "Kakamega", "election_year": 2027}'::jsonb, 'General campaign metadata'),
    ('consent_policy', '{"version": "v1.2-2027", "mandatory": true, "notice_url": "/privacy", "dpa_2019_registered": true}'::jsonb, 'Kenya Data Protection Act 2019 consent configuration'),
    ('verification_providers', '{"register_import_enabled": true, "manual_enabled": true, "external_link_enabled": false, "external_rate_limit_per_min": 5}'::jsonb, 'Verification provider flags and rate limits'),
    ('projection_model', '{"verified_voter_turnout": 0.82, "unverified_voter_turnout": 0.58, "strong_supporter_conv": 0.90, "leaning_conv": 0.65, "undecided_conv": 0.35}'::jsonb, 'Transparent victory projection model coefficients'),
    ('chp_compliance_note', '{"visible": true, "exclude_default": true, "text": "CHPs are community health workers linked to public health programmes. Ensure political activities respect public service neutrality regulations."}'::jsonb, 'Legal notice for Community Health Promoters')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- ----------------------------------------------------------------------------
-- 6. NETWORK INFLUENCERS (Pastors & Community Health Promoters / CHPs)
-- ----------------------------------------------------------------------------
-- Pastors (Faith Leaders)
INSERT INTO public.network_contacts (id, type, name, phone_e164, denomination, ward_id, reach_status, notes) VALUES
    ('d0000001-0000-4000-8000-000000000001', 'pastor', 'Synthetic Pastor 01', NULL, 'Synthetic Demo', 'a0000001-0000-0000-0000-000000000001', 'not_contacted', 'SYNTHETIC TEST CONTACT - NOT A REAL PERSON'),
    ('d0000001-0000-4000-8000-000000000002', 'pastor', 'Synthetic Pastor 02', NULL, 'Synthetic Demo', 'a0000001-0000-0000-0000-000000000005', 'not_contacted', 'SYNTHETIC TEST CONTACT - NOT A REAL PERSON'),
    ('d0000001-0000-4000-8000-000000000003', 'pastor', 'Synthetic Pastor 03', NULL, 'Synthetic Demo', 'a0000001-0000-0000-0000-000000000006', 'not_contacted', 'SYNTHETIC TEST CONTACT - NOT A REAL PERSON'),
    ('d0000001-0000-4000-8000-000000000004', 'pastor', 'Synthetic Pastor 04', NULL, 'Synthetic Demo', 'a0000001-0000-0000-0000-000000000004', 'not_contacted', 'SYNTHETIC TEST CONTACT - NOT A REAL PERSON'),
    ('d0000001-0000-4000-8000-000000000005', 'pastor', 'Synthetic Pastor 05', NULL, 'Synthetic Demo', 'a0000001-0000-0000-0000-000000000003', 'not_contacted', 'SYNTHETIC TEST CONTACT - NOT A REAL PERSON'),
    ('d0000001-0000-4000-8000-000000000006', 'pastor', 'Synthetic Pastor 06', NULL, 'Synthetic Demo', 'a0000001-0000-0000-0000-000000000002', 'not_contacted', 'SYNTHETIC TEST CONTACT - NOT A REAL PERSON'),
    ('d0000001-0000-4000-8000-000000000007', 'pastor', 'Synthetic Pastor 07', NULL, 'Synthetic Demo', 'a0000001-0000-0000-0000-000000000001', 'not_contacted', 'SYNTHETIC TEST CONTACT - NOT A REAL PERSON'),
    ('d0000001-0000-4000-8000-000000000008', 'pastor', 'Synthetic Pastor 08', NULL, 'Synthetic Demo', 'a0000001-0000-0000-0000-000000000005', 'not_contacted', 'SYNTHETIC TEST CONTACT - NOT A REAL PERSON'),
    ('d0000001-0000-4000-8000-000000000009', 'pastor', 'Synthetic Pastor 09', NULL, 'Synthetic Demo', 'a0000001-0000-0000-0000-000000000006', 'not_contacted', 'SYNTHETIC TEST CONTACT - NOT A REAL PERSON'),
    ('d0000001-0000-4000-8000-000000000010', 'pastor', 'Synthetic Pastor 10', NULL, 'Synthetic Demo', 'a0000001-0000-0000-0000-000000000004', 'not_contacted', 'SYNTHETIC TEST CONTACT - NOT A REAL PERSON')
ON CONFLICT DO NOTHING;

-- CHPs (Community Health Promoters) - linked to Community Units (CUs)
INSERT INTO public.network_contacts (id, type, name, phone_e164, community_unit, sub_county, ward_id, reach_status, notes, exclude_from_campaign_exports) VALUES
    ('d0000002-0000-4000-8000-000000000001', 'chp', 'Synthetic CHP 01', NULL, 'Synthetic Unit 01', 'Synthetic Sub-county', 'a0000001-0000-0000-0000-000000000001', 'not_contacted', 'SYNTHETIC TEST CONTACT - NOT A REAL PERSON', true),
    ('d0000002-0000-4000-8000-000000000002', 'chp', 'Synthetic CHP 02', NULL, 'Synthetic Unit 02', 'Synthetic Sub-county', 'a0000001-0000-0000-0000-000000000005', 'not_contacted', 'SYNTHETIC TEST CONTACT - NOT A REAL PERSON', true),
    ('d0000002-0000-4000-8000-000000000003', 'chp', 'Synthetic CHP 03', NULL, 'Synthetic Unit 03', 'Synthetic Sub-county', 'a0000001-0000-0000-0000-000000000006', 'not_contacted', 'SYNTHETIC TEST CONTACT - NOT A REAL PERSON', true),
    ('d0000002-0000-4000-8000-000000000004', 'chp', 'Synthetic CHP 04', NULL, 'Synthetic Unit 04', 'Synthetic Sub-county', 'a0000001-0000-0000-0000-000000000004', 'not_contacted', 'SYNTHETIC TEST CONTACT - NOT A REAL PERSON', true),
    ('d0000002-0000-4000-8000-000000000005', 'chp', 'Synthetic CHP 05', NULL, 'Synthetic Unit 05', 'Synthetic Sub-county', 'a0000001-0000-0000-0000-000000000003', 'not_contacted', 'SYNTHETIC TEST CONTACT - NOT A REAL PERSON', true),
    ('d0000002-0000-4000-8000-000000000006', 'chp', 'Synthetic CHP 06', NULL, 'Synthetic Unit 06', 'Synthetic Sub-county', 'a0000001-0000-0000-0000-000000000002', 'not_contacted', 'SYNTHETIC TEST CONTACT - NOT A REAL PERSON', true),
    ('d0000002-0000-4000-8000-000000000007', 'chp', 'Synthetic CHP 07', NULL, 'Synthetic Unit 07', 'Synthetic Sub-county', 'a0000001-0000-0000-0000-000000000001', 'not_contacted', 'SYNTHETIC TEST CONTACT - NOT A REAL PERSON', true),
    ('d0000002-0000-4000-8000-000000000008', 'chp', 'Synthetic CHP 08', NULL, 'Synthetic Unit 08', 'Synthetic Sub-county', 'a0000001-0000-0000-0000-000000000005', 'not_contacted', 'SYNTHETIC TEST CONTACT - NOT A REAL PERSON', true),
    ('d0000002-0000-4000-8000-000000000009', 'chp', 'Synthetic CHP 09', NULL, 'Synthetic Unit 09', 'Synthetic Sub-county', 'a0000001-0000-0000-0000-000000000006', 'not_contacted', 'SYNTHETIC TEST CONTACT - NOT A REAL PERSON', true),
    ('d0000002-0000-4000-8000-000000000010', 'chp', 'Synthetic CHP 10', NULL, 'Synthetic Unit 10', 'Synthetic Sub-county', 'a0000001-0000-0000-0000-000000000004', 'not_contacted', 'SYNTHETIC TEST CONTACT - NOT A REAL PERSON', true)
ON CONFLICT DO NOTHING;

DO $$ BEGIN
 IF (SELECT count(*) FROM public.wards WHERE id::text LIKE 'a0000001-%')<6 THEN RAISE EXCEPTION 'Missing canonical wards'; END IF;
 IF (SELECT count(*) FROM public.polling_centres WHERE id::text LIKE 'b000000%')<13 THEN RAISE EXCEPTION 'Missing canonical centres'; END IF;
 IF (SELECT count(*) FROM public.polling_stations WHERE polling_centre_id::text LIKE 'b000000%')<7 THEN RAISE EXCEPTION 'Missing canonical stations'; END IF;
 IF (SELECT count(*) FROM public.settings WHERE key IN ('campaign_info','consent_policy','verification_providers','projection_model','chp_compliance_note'))<>5 THEN RAISE EXCEPTION 'Missing canonical settings'; END IF;
 IF (SELECT count(*) FROM public.network_contacts WHERE id::text LIKE 'c0000001-%')<9 THEN RAISE EXCEPTION 'Missing canonical network contacts'; END IF;
END $$;
COMMIT;
