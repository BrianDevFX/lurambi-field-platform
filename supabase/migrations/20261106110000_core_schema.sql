-- Fresh-install schema. Apply through Supabase migrations; do not use the retired
-- schema.sql / repair_and_seed.sql scripts.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

DO $$ BEGIN CREATE TYPE public.user_role AS ENUM ('admin', 'ward_coordinator', 'mobilizer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.user_status AS ENUM ('pending', 'approved', 'suspended', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.verification_status AS ENUM ('unverified', 'verified', 'not_found', 'wrong_constituency', 'pending_id');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.support_level AS ENUM ('strong_supporter', 'leaning', 'undecided', 'opposed', 'not_reached', 'not_assessed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.entry_source AS ENUM ('legacy', 'mobilizer', 'self_registered');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.network_contact_type AS ENUM ('pastor', 'chp', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.reach_status AS ENUM ('not_contacted', 'contacted', 'meeting_held');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.flag_severity AS ENUM ('critical', 'warning', 'info');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.canonical_type AS ENUM ('ward', 'polling_centre', 'polling_station');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO postgres, service_role;
CREATE TABLE IF NOT EXISTS private.app_secrets (
  name TEXT PRIMARY KEY CHECK (name IN ('id_hmac_secret', 'id_encryption_key')),
  value TEXT NOT NULL CHECK (length(value) >= 32),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE private.app_secrets FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.wards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  constituency_name TEXT NOT NULL DEFAULT 'Lurambi',
  county_name TEXT NOT NULL DEFAULT 'Kakamega',
  name TEXT NOT NULL UNIQUE,
  code TEXT UNIQUE,
  registered_voters_target INTEGER CHECK (registered_voters_target IS NULL OR registered_voters_target >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.polling_centres (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ward_id UUID NOT NULL REFERENCES public.wards(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  code TEXT,
  total_registered_voters INTEGER CHECK (total_registered_voters IS NULL OR total_registered_voters >= 0),
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ward_id, name)
);

CREATE TABLE IF NOT EXISTS public.polling_stations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  polling_centre_id UUID NOT NULL REFERENCES public.polling_centres(id) ON DELETE RESTRICT,
  ward_id UUID NOT NULL REFERENCES public.wards(id) ON DELETE RESTRICT,
  station_name TEXT NOT NULL,
  station_number INTEGER NOT NULL DEFAULT 1 CHECK (station_number > 0),
  registered_voters_est INTEGER CHECK (registered_voters_est IS NULL OR registered_voters_est >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (polling_centre_id, station_name)
);

CREATE TABLE IF NOT EXISTS public.place_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_alias TEXT NOT NULL,
  canonical_type public.canonical_type NOT NULL,
  target_ward_id UUID REFERENCES public.wards(id) ON DELETE SET NULL,
  target_polling_centre_id UUID REFERENCES public.polling_centres(id) ON DELETE SET NULL,
  target_polling_station_id UUID REFERENCES public.polling_stations(id) ON DELETE SET NULL,
  confidence NUMERIC(3,2) NOT NULL DEFAULT 1.00 CHECK (confidence BETWEEN 0 AND 1),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (raw_alias, canonical_type),
  CHECK (
    (canonical_type = 'ward' AND target_ward_id IS NOT NULL AND target_polling_centre_id IS NULL AND target_polling_station_id IS NULL)
    OR (canonical_type = 'polling_centre' AND target_polling_centre_id IS NOT NULL AND target_polling_station_id IS NULL)
    OR (canonical_type = 'polling_station' AND target_polling_station_id IS NOT NULL)
    OR (confidence = 0 AND target_ward_id IS NULL AND target_polling_centre_id IS NULL AND target_polling_station_id IS NULL)
  )
);

-- profiles.id matches auth.users.id; the reserved legacy profile has no auth user.
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY,
  email TEXT,
  full_name TEXT NOT NULL,
  phone_e164 TEXT UNIQUE,
  national_id_masked TEXT,
  national_id_hash TEXT UNIQUE,
  national_id_encrypted BYTEA,
  role public.user_role NOT NULL DEFAULT 'mobilizer',
  status public.user_status NOT NULL DEFAULT 'pending',
  home_ward_id UUID REFERENCES public.wards(id) ON DELETE SET NULL,
  home_polling_station_id UUID REFERENCES public.polling_stations(id) ON DELETE SET NULL,
  referral_code VARCHAR(6) UNIQUE,
  approved_by UUID REFERENCES public.profiles(id),
  approved_at TIMESTAMPTZ,
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.voter_register (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  national_id_hash TEXT NOT NULL UNIQUE,
  national_id_encrypted BYTEA NOT NULL,
  national_id_masked TEXT NOT NULL,
  full_name TEXT NOT NULL,
  first_name TEXT,
  other_names TEXT,
  gender CHAR(1),
  date_of_birth DATE,
  constituency TEXT NOT NULL DEFAULT 'Lurambi',
  ward_id UUID REFERENCES public.wards(id) ON DELETE SET NULL,
  ward_name_raw TEXT,
  polling_centre_id UUID REFERENCES public.polling_centres(id) ON DELETE SET NULL,
  polling_centre_name_raw TEXT,
  polling_station_id UUID REFERENCES public.polling_stations(id) ON DELETE SET NULL,
  voter_number TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  import_type TEXT NOT NULL CHECK (import_type IN ('entries', 'network_contacts', 'places', 'voter_register')),
  total_rows INTEGER NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
  imported_rows INTEGER NOT NULL DEFAULT 0 CHECK (imported_rows >= 0),
  duplicate_rows INTEGER NOT NULL DEFAULT 0 CHECK (duplicate_rows >= 0),
  rejected_rows INTEGER NOT NULL DEFAULT 0 CHECK (rejected_rows >= 0),
  flagged_rows INTEGER NOT NULL DEFAULT 0 CHECK (flagged_rows >= 0),
  unmapped_rows INTEGER NOT NULL DEFAULT 0 CHECK (unmapped_rows >= 0),
  summary_report JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_request_id UUID NOT NULL UNIQUE,
  mobilizer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ward_filed_id UUID NOT NULL REFERENCES public.wards(id) ON DELETE RESTRICT,
  polling_centre_id UUID REFERENCES public.polling_centres(id) ON DELETE SET NULL,
  polling_station_id UUID REFERENCES public.polling_stations(id) ON DELETE SET NULL,
  register_voter_id UUID REFERENCES public.voter_register(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 160),
  phone_e164 TEXT,
  id_hash TEXT,
  id_encrypted BYTEA,
  id_masked TEXT,
  support_level public.support_level NOT NULL DEFAULT 'not_assessed',
  issues TEXT[] NOT NULL DEFAULT '{}',
  needs_transport BOOLEAN NOT NULL DEFAULT false,
  has_pvc BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  consent_at TIMESTAMPTZ,
  consent_text_version TEXT,
  consent_status TEXT NOT NULL DEFAULT 'given' CHECK (consent_status IN ('given', 'legacy_unconfirmed', 'withdrawn')),
  source public.entry_source NOT NULL DEFAULT 'mobilizer',
  verification_status public.verification_status NOT NULL DEFAULT 'unverified',
  verification_notes TEXT,
  verified_by UUID REFERENCES public.profiles(id),
  verified_at TIMESTAMPTZ,
  legacy_mobilizer_label TEXT,
  captured_on TIMESTAMPTZ NOT NULL DEFAULT now(),
  import_batch_id UUID REFERENCES public.imports(id) ON DELETE SET NULL,
  row_hash TEXT,
  flags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (source = 'legacy' OR (consent_at IS NOT NULL AND consent_text_version IS NOT NULL)),
  CHECK (consent_status <> 'legacy_unconfirmed' OR source = 'legacy')
);

CREATE TABLE IF NOT EXISTS public.flag_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.entries(id) ON DELETE CASCADE,
  flag_code TEXT NOT NULL CHECK (flag_code IN ('DUPLICATE','POSSIBLE_DUPLICATE','NOT_IN_CONSTITUENCY','WRONG_CONSTITUENCY','WARD_MISMATCH','FILED_UNDER_DIFFERENT_WARD','MISSING_ID','INVALID_ID','INVALID_PHONE','SHARED_PHONE','UNMAPPED_PLACE','LOW_CONFIDENCE_MATCH')),
  severity public.flag_severity NOT NULL DEFAULT 'warning',
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_by UUID REFERENCES public.profiles(id),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entry_id, flag_code)
);

CREATE TABLE IF NOT EXISTS public.duplicate_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mobilizer_id UUID REFERENCES public.profiles(id),
  matched_entry_id UUID REFERENCES public.entries(id) ON DELETE SET NULL,
  attempted_name TEXT NOT NULL,
  attempted_phone TEXT,
  attempted_id_hash TEXT,
  attempted_ward_id UUID REFERENCES public.wards(id),
  match_reason TEXT NOT NULL,
  ip_address_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.network_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type public.network_contact_type NOT NULL,
  name TEXT NOT NULL,
  phone_e164 TEXT,
  national_id_hash TEXT,
  national_id_encrypted BYTEA,
  denomination TEXT,
  community_unit TEXT,
  sub_county TEXT DEFAULT 'Lurambi',
  ward_id UUID REFERENCES public.wards(id) ON DELETE SET NULL,
  polling_station_id UUID REFERENCES public.polling_stations(id) ON DELETE SET NULL,
  reach_status public.reach_status NOT NULL DEFAULT 'not_contacted',
  notes TEXT,
  exclude_from_campaign_exports BOOLEAN NOT NULL DEFAULT false,
  import_batch_id UUID REFERENCES public.imports(id) ON DELETE SET NULL,
  row_hash TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.exports_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  export_type TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('xlsx', 'csv', 'pdf')),
  filter_criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  row_count INTEGER NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  file_name TEXT NOT NULL,
  ip_address_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id),
  user_email TEXT,
  user_role TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  old_values JSONB,
  new_values JSONB,
  reason TEXT NOT NULL CHECK (length(btrim(reason)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.data_subject_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type TEXT NOT NULL CHECK (request_type IN ('access', 'correction', 'deletion')),
  requester_name TEXT NOT NULL,
  phone_e164 TEXT NOT NULL,
  national_id_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'rejected')),
  notes TEXT,
  resolved_by UUID REFERENCES public.profiles(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES public.profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rate_limits (
  scope TEXT NOT NULL,
  subject_hash TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, subject_hash, window_start)
);

CREATE UNIQUE INDEX IF NOT EXISTS entries_id_hash_unique
  ON public.entries(id_hash) WHERE id_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS entries_row_hash_unique
  ON public.entries(row_hash) WHERE row_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS entries_name_trgm_idx ON public.entries USING gin (name extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS voter_register_name_trgm_idx ON public.voter_register USING gin (full_name extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS voter_register_ward_idx ON public.voter_register(ward_id);
CREATE INDEX IF NOT EXISTS entries_ward_created_idx ON public.entries(ward_filed_id, created_at DESC);
CREATE INDEX IF NOT EXISTS entries_station_idx ON public.entries(polling_station_id);
CREATE INDEX IF NOT EXISTS entries_mobilizer_idx ON public.entries(mobilizer_id);
CREATE INDEX IF NOT EXISTS flags_unresolved_idx ON public.flag_events(created_at) WHERE is_resolved = false;
CREATE INDEX IF NOT EXISTS aliases_raw_trgm_idx ON public.place_aliases USING gin (raw_alias extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS network_contacts_ward_idx ON public.network_contacts(ward_id);
CREATE INDEX IF NOT EXISTS network_contacts_type_idx ON public.network_contacts(type);

-- Reserve an app profile for imports without creating a login account.
INSERT INTO public.profiles (id, email, full_name, role, status)
VALUES ('00000000-0000-4000-8000-000000000001', 'legacy-import@lurambi.invalid', 'Legacy Import', 'mobilizer', 'approved')
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE t RECORD;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
