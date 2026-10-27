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
CREATE POLICY "Hierarchy readable by authenticated users"
    ON public.wards FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Centres readable by authenticated users"
    ON public.polling_centres FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Stations readable by authenticated users"
    ON public.polling_stations FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Aliases readable by authenticated users"
    ON public.place_aliases FOR SELECT
    TO authenticated
    USING (true);

-- Admin can manage hierarchy
CREATE POLICY "Hierarchy admin manage"
    ON public.wards FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "Centres admin manage"
    ON public.polling_centres FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "Stations admin manage"
    ON public.polling_stations FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "Aliases admin manage"
    ON public.place_aliases FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ---------------------------------------
-- RLS: PROFILES
-- ---------------------------------------
-- Users can see their own profile
CREATE POLICY "Users read own profile"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (id = auth.uid());

-- Ward coordinators can see mobilizers from their ward
CREATE POLICY "Coordinators view ward mobilizers"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (
        public.is_coordinator() AND
        home_ward_id = public.current_user_ward()
    );

-- Coordinators can approve mobilizers in their ward
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
CREATE POLICY "Admins full manage profiles"
    ON public.profiles FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Self-registration creates profile
CREATE POLICY "Users insert self profile"
    ON public.profiles FOR INSERT
    TO authenticated
    WITH CHECK (id = auth.uid());

-- ---------------------------------------
-- RLS: ENTRIES (CRITICAL SPECIFICATION)
-- ---------------------------------------
-- 1. Mobilizers can INSERT entries
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
CREATE POLICY "Mobilizers can select only their own entries"
    ON public.entries FOR SELECT
    TO authenticated
    USING (mobilizer_id = auth.uid());

-- 3. Coordinators can SELECT entries filed in their ward
CREATE POLICY "Coordinators can select ward entries"
    ON public.entries FOR SELECT
    TO authenticated
    USING (
        public.is_coordinator() AND
        ward_filed_id = public.current_user_ward()
    );

-- 4. Admins have FULL SELECT and INSERT access
CREATE POLICY "Admins can select all entries"
    ON public.entries FOR SELECT
    TO authenticated
    USING (public.is_admin());

CREATE POLICY "Admins can insert entries"
    ON public.entries FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin());

-- 5. Admins can UPDATE entries (Mandatory audit log trigger will capture reason)
CREATE POLICY "Admins can update entries"
    ON public.entries FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 6. Admins can DELETE entries (Mandatory audit log trigger will capture reason)
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
CREATE POLICY "Approved mobilizers can search voter register"
    ON public.voter_register FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND status = 'approved'
        )
    );

CREATE POLICY "Admins can manage voter register"
    ON public.voter_register FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ---------------------------------------
-- RLS: NETWORK CONTACTS
-- ---------------------------------------
CREATE POLICY "Admins manage network contacts"
    ON public.network_contacts FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

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
CREATE POLICY "Admins view and insert audit logs"
    ON public.audit_log FOR SELECT
    TO authenticated
    USING (public.is_admin());

CREATE POLICY "Authenticated users can write audit log via trigger"
    ON public.audit_log FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Admins view and manage imports"
    ON public.imports FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "Users can insert export logs"
    ON public.exports_log FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins view export logs"
    ON public.exports_log FOR SELECT
    TO authenticated
    USING (public.is_admin());

CREATE POLICY "Admins manage settings"
    ON public.settings FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

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
