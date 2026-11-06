CREATE OR REPLACE FUNCTION private.consume_rate_limit(p_scope TEXT, p_subject TEXT, p_limit INTEGER, p_window_seconds INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_start TIMESTAMPTZ; v_hash TEXT; v_hits INTEGER;
BEGIN
  IF p_limit < 1 OR p_window_seconds < 1 THEN RAISE EXCEPTION 'Invalid rate limit configuration'; END IF;
  v_start := to_timestamp(floor(extract(epoch FROM clock_timestamp()) / p_window_seconds) * p_window_seconds);
  v_hash := encode(extensions.digest(convert_to(coalesce(p_subject, 'anonymous'), 'UTF8'), 'sha256'), 'hex');
  INSERT INTO public.rate_limits(scope, subject_hash, window_start, hit_count, updated_at)
  VALUES (p_scope, v_hash, v_start, 1, now())
  ON CONFLICT (scope, subject_hash, window_start)
  DO UPDATE SET hit_count = public.rate_limits.hit_count + 1, updated_at = now()
  RETURNING hit_count INTO v_hits;
  IF v_hits = p_limit + 1 AND auth.uid() IS NOT NULL THEN
    PERFORM private.audit_event('SEARCH_RATE_LIMIT_BURST', 'rate_limits', p_scope, NULL,
      jsonb_build_object('scope', p_scope, 'hit_count', v_hits), 'Automatic search burst alert');
  END IF;
  IF v_hits > p_limit THEN RAISE EXCEPTION 'Rate limit exceeded' USING ERRCODE = '42900'; END IF;
  RETURN v_hits;
END;
$$;

CREATE OR REPLACE FUNCTION private.resolve_place_alias(p_type public.canonical_type, p_raw TEXT)
RETURNS TABLE(ward_id UUID, centre_id UUID, station_id UUID, confidence NUMERIC)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT a.target_ward_id, a.target_polling_centre_id, a.target_polling_station_id, a.confidence
  FROM public.place_aliases a
  WHERE a.canonical_type = p_type AND a.confidence > 0
    AND (lower(btrim(a.raw_alias)) = lower(btrim(p_raw)) OR extensions.similarity(a.raw_alias, p_raw) >= 0.65)
  ORDER BY (lower(btrim(a.raw_alias)) = lower(btrim(p_raw))) DESC,
           a.confidence DESC,
           extensions.similarity(a.raw_alias, p_raw) DESC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION private.persist_entry_flags(p_entry_id UUID, p_flags TEXT[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_code TEXT; v_severity public.flag_severity;
BEGIN
  FOREACH v_code IN ARRAY coalesce(p_flags, ARRAY[]::TEXT[]) LOOP
    v_severity := CASE WHEN v_code IN ('DUPLICATE', 'NOT_IN_CONSTITUENCY', 'WRONG_CONSTITUENCY') THEN 'critical'::public.flag_severity
                      WHEN v_code = 'SHARED_PHONE' THEN 'info'::public.flag_severity
                      ELSE 'warning'::public.flag_severity END;
    INSERT INTO public.flag_events(entry_id, flag_code, severity, details)
    VALUES (p_entry_id, v_code, v_severity, '{}'::jsonb)
    ON CONFLICT (entry_id, flag_code) DO NOTHING;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION private.insert_entry_core(
  p_client_request_id UUID,
  p_mobilizer_id UUID,
  p_name TEXT,
  p_phone TEXT,
  p_national_id TEXT,
  p_ward_id UUID,
  p_centre_id UUID,
  p_station_id UUID,
  p_centre_label TEXT,
  p_station_label TEXT,
  p_support public.support_level,
  p_issues TEXT[],
  p_needs_transport BOOLEAN,
  p_has_pvc BOOLEAN,
  p_notes TEXT,
  p_consent BOOLEAN,
  p_consent_version TEXT,
  p_source public.entry_source,
  p_captured_on TIMESTAMPTZ DEFAULT now(),
  p_legacy_label TEXT DEFAULT NULL,
  p_import_id UUID DEFAULT NULL,
  p_row_hash TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name TEXT := btrim(coalesce(p_name, ''));
  v_phone TEXT := public.normalize_kenyan_phone(p_phone);
  v_raw_id TEXT := private.clean_national_id(p_national_id);
  v_id_hash TEXT;
  v_masked TEXT;
  v_encrypted BYTEA;
  v_ward UUID := p_ward_id;
  v_centre UUID := p_centre_id;
  v_station UUID := p_station_id;
  v_alias RECORD;
  v_flags TEXT[] := ARRAY[]::TEXT[];
  v_entry_id UUID;
  v_existing RECORD;
  v_register_id UUID;
  v_register_constituency TEXT;
  v_register_ward_id UUID;
  v_station_centre_id UUID;
  v_similarity REAL;
  v_consent JSONB;
BEGIN
  IF p_client_request_id IS NULL THEN RAISE EXCEPTION 'client_request_id is required'; END IF;
  IF length(v_name) < 2 OR length(v_name) > 160 THEN RAISE EXCEPTION 'Name is required and must be at most 160 characters'; END IF;
  IF v_ward IS NULL OR NOT EXISTS (SELECT 1 FROM public.wards WHERE id = v_ward) THEN RAISE EXCEPTION 'A valid filing ward is required'; END IF;
  IF p_source <> 'legacy' THEN
    IF p_consent IS DISTINCT FROM true OR NULLIF(btrim(p_consent_version), '') IS NULL THEN
      RAISE EXCEPTION 'Consent and consent text version are required' USING ERRCODE = '23514';
    END IF;
    SELECT value INTO v_consent FROM public.settings WHERE key = 'consent_policy';
    IF coalesce((v_consent->>'enabled')::boolean, false) IS DISTINCT FROM true
       OR coalesce(v_consent->>'version', '') <> p_consent_version THEN
      RAISE EXCEPTION 'Consent policy is not configured for this text version' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF p_source = 'legacy' AND (p_consent IS TRUE OR p_consent_version IS NOT NULL) THEN
    RAISE EXCEPTION 'Legacy rows must remain consent-unconfirmed';
  END IF;

  IF EXISTS (SELECT 1 FROM public.entries WHERE client_request_id = p_client_request_id) THEN
    SELECT id, name, id_masked, ward_filed_id, flags INTO v_existing
    FROM public.entries WHERE client_request_id = p_client_request_id;
    IF v_existing.id IS NULL OR v_existing.id NOT IN (SELECT id FROM public.entries WHERE mobilizer_id = p_mobilizer_id OR p_source = 'self_registered') THEN
      RAISE EXCEPTION 'client_request_id is already in use' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('saved', true, 'id', v_existing.id, 'idempotent_replay', true,
      'name', v_existing.name, 'id_masked', v_existing.id_masked, 'flags', v_existing.flags);
  END IF;

  IF v_raw_id IS NULL THEN
    v_flags := array_append(v_flags, 'MISSING_ID');
  ELSE
    IF length(v_raw_id) NOT IN (7, 8) THEN
      v_flags := array_append(v_flags, 'INVALID_ID');
    ELSE
      v_id_hash := private.hash_national_id(v_raw_id);
    END IF;
    v_masked := private.mask_national_id(v_raw_id);
    v_encrypted := private.encrypt_national_id(v_raw_id);
  END IF;
  IF v_phone IS NULL THEN v_flags := array_append(v_flags, 'INVALID_PHONE'); END IF;

  IF v_centre IS NULL AND NULLIF(btrim(p_centre_label), '') IS NOT NULL THEN
    SELECT id INTO v_centre FROM public.polling_centres WHERE lower(btrim(name)) = lower(btrim(p_centre_label)) LIMIT 1;
    IF v_centre IS NULL THEN
      SELECT * INTO v_alias FROM private.resolve_place_alias('polling_centre', p_centre_label);
      v_centre := v_alias.centre_id;
      IF v_centre IS NOT NULL AND v_alias.confidence < 0.85 THEN v_flags := array_append(v_flags, 'LOW_CONFIDENCE_MATCH'); END IF;
    END IF;
    IF v_centre IS NULL THEN v_flags := array_append(v_flags, 'UNMAPPED_PLACE'); END IF;
  END IF;
  IF v_station IS NULL AND NULLIF(btrim(p_station_label), '') IS NOT NULL THEN
    SELECT id INTO v_station FROM public.polling_stations WHERE lower(btrim(station_name)) = lower(btrim(p_station_label)) LIMIT 1;
    IF v_station IS NULL THEN
      SELECT * INTO v_alias FROM private.resolve_place_alias('polling_station', p_station_label);
      v_station := v_alias.station_id;
      IF v_station IS NOT NULL AND v_alias.confidence < 0.85 THEN v_flags := array_append(v_flags, 'LOW_CONFIDENCE_MATCH'); END IF;
    END IF;
    IF v_station IS NULL THEN v_flags := array_append(v_flags, 'UNMAPPED_PLACE'); END IF;
  END IF;
  IF v_centre IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.polling_centres WHERE id = v_centre) THEN
    RAISE EXCEPTION 'Polling centre does not exist';
  END IF;
  IF v_station IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.polling_stations WHERE id = v_station) THEN
    RAISE EXCEPTION 'Polling station does not exist';
  END IF;
  IF v_station IS NOT NULL THEN
    SELECT polling_centre_id INTO v_station_centre_id FROM public.polling_stations WHERE id=v_station;
    IF v_centre IS NULL THEN
      v_centre := v_station_centre_id;
    ELSIF v_centre <> v_station_centre_id THEN
      RAISE EXCEPTION 'Polling station does not belong to the selected centre';
    END IF;
  END IF;
  IF v_centre IS NOT NULL AND (SELECT ward_id FROM public.polling_centres WHERE id = v_centre) <> v_ward THEN
    v_flags := array_append(v_flags, 'WARD_MISMATCH');
    v_flags := array_append(v_flags, 'FILED_UNDER_DIFFERENT_WARD');
  END IF;
  IF v_station IS NOT NULL AND (SELECT ward_id FROM public.polling_stations WHERE id = v_station) <> v_ward THEN
    v_flags := array_append(v_flags, 'WARD_MISMATCH');
    v_flags := array_append(v_flags, 'FILED_UNDER_DIFFERENT_WARD');
  END IF;

  IF v_id_hash IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(v_id_hash, 0));
    SELECT id, name, id_masked, ward_filed_id INTO v_existing
    FROM public.entries WHERE id_hash = v_id_hash LIMIT 1;
    IF FOUND THEN
      INSERT INTO public.duplicate_attempts(mobilizer_id, matched_entry_id, attempted_name, attempted_phone, attempted_id_hash, attempted_ward_id, match_reason)
      VALUES (p_mobilizer_id, v_existing.id, v_name, v_phone, v_id_hash, v_ward, 'normalized_id');
      RETURN jsonb_build_object('blocked', true, 'flag', 'DUPLICATE', 'matched', jsonb_build_object(
        'id', v_existing.id, 'name', v_existing.name, 'id_masked', v_existing.id_masked, 'ward_filed_id', v_existing.ward_filed_id));
    END IF;
  END IF;

  IF v_phone IS NOT NULL AND EXISTS (SELECT 1 FROM public.entries WHERE phone_e164 = v_phone) THEN
    v_flags := array_append(v_flags, 'SHARED_PHONE');
  END IF;

  SELECT e.id, e.name, e.id_masked, e.ward_filed_id, extensions.similarity(e.name, v_name) AS sim
  INTO v_existing
  FROM public.entries e
  WHERE v_raw_id IS NULL AND e.id_hash IS NULL
    AND e.polling_centre_id IS NOT DISTINCT FROM v_centre
    AND e.polling_station_id IS NOT DISTINCT FROM v_station
    AND (e.phone_e164 = v_phone OR e.ward_filed_id = v_ward)
    AND extensions.similarity(e.name, v_name) >= 0.70
  ORDER BY extensions.similarity(e.name, v_name) DESC
  LIMIT 1;
  IF FOUND THEN
    v_similarity := v_existing.sim;
    IF v_similarity >= 0.85 THEN
      INSERT INTO public.duplicate_attempts(mobilizer_id, matched_entry_id, attempted_name, attempted_phone, attempted_ward_id, match_reason)
      VALUES (p_mobilizer_id, v_existing.id, v_name, v_phone, v_ward, 'name_location_phone_or_ward_similarity');
      RETURN jsonb_build_object('blocked', true, 'flag', 'DUPLICATE', 'matched', jsonb_build_object(
        'id', v_existing.id, 'name', v_existing.name, 'id_masked', v_existing.id_masked, 'ward_filed_id', v_existing.ward_filed_id));
    END IF;
    v_flags := array_append(v_flags, 'POSSIBLE_DUPLICATE');
  END IF;

  IF v_id_hash IS NOT NULL THEN
    SELECT id, constituency, ward_id INTO v_register_id, v_register_constituency, v_register_ward_id
    FROM public.voter_register WHERE national_id_hash = v_id_hash AND is_active LIMIT 1;
    IF FOUND THEN
      IF lower(coalesce(v_register_constituency, '')) <> 'lurambi' THEN
        v_flags := array_append(v_flags, 'NOT_IN_CONSTITUENCY');
        v_flags := array_append(v_flags, 'WRONG_CONSTITUENCY');
      ELSE
        IF v_register_ward_id IS NOT NULL AND v_register_ward_id <> v_ward THEN
          v_flags := array_append(v_flags, 'WARD_MISMATCH');
          v_flags := array_append(v_flags, 'FILED_UNDER_DIFFERENT_WARD');
        END IF;
      END IF;
    END IF;
  END IF;

  v_flags := ARRAY(SELECT DISTINCT f FROM unnest(v_flags) AS f ORDER BY f);
  INSERT INTO public.entries (
    client_request_id, mobilizer_id, ward_filed_id, polling_centre_id, polling_station_id, register_voter_id,
    name, phone_e164, id_hash, id_encrypted, id_masked, support_level, issues, needs_transport, has_pvc, notes,
    consent_at, consent_text_version, consent_status, source, verification_status, legacy_mobilizer_label,
    captured_on, import_batch_id, row_hash, flags
  ) VALUES (
    p_client_request_id, p_mobilizer_id, v_ward, v_centre, v_station, v_register_id,
    v_name, v_phone, v_id_hash, v_encrypted, v_masked, coalesce(p_support, 'not_assessed'), coalesce(p_issues, ARRAY[]::TEXT[]),
    coalesce(p_needs_transport, false), coalesce(p_has_pvc, false), NULLIF(btrim(p_notes), ''),
    CASE WHEN p_source = 'legacy' THEN NULL ELSE now() END,
    CASE WHEN p_source = 'legacy' THEN NULL ELSE p_consent_version END,
    CASE WHEN p_source = 'legacy' THEN 'legacy_unconfirmed' ELSE 'given' END,
    p_source, CASE WHEN v_raw_id IS NULL THEN 'pending_id'::public.verification_status ELSE 'unverified'::public.verification_status END,
    p_legacy_label, coalesce(p_captured_on, now()), p_import_id, p_row_hash, v_flags
  ) RETURNING id INTO v_entry_id;
  PERFORM private.persist_entry_flags(v_entry_id, v_flags);
  RETURN jsonb_build_object('saved', true, 'id', v_entry_id, 'id_masked', v_masked, 'flags', v_flags,
    'verification_status', CASE WHEN v_raw_id IS NULL THEN 'pending_id' ELSE 'unverified' END);
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_entry(
  p_client_request_id UUID, p_name TEXT, p_phone TEXT, p_national_id TEXT,
  p_ward_filed_id UUID, p_polling_centre_id UUID, p_polling_station_id UUID,
  p_polling_centre_label TEXT, p_polling_station_label TEXT,
  p_support_level public.support_level, p_issues TEXT[], p_needs_transport BOOLEAN,
  p_has_pvc BOOLEAN, p_notes TEXT, p_consent BOOLEAN, p_consent_text_version TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_profile public.profiles;
BEGIN
  v_profile := private.require_roles(ARRAY['mobilizer']::public.user_role[], true);
  RETURN private.insert_entry_core(p_client_request_id, v_profile.id, p_name, p_phone, p_national_id,
    p_ward_filed_id, p_polling_centre_id, p_polling_station_id, p_polling_centre_label, p_polling_station_label,
    p_support_level, p_issues, p_needs_transport, p_has_pvc, p_notes, p_consent, p_consent_text_version,
    'mobilizer', now(), NULL, NULL, NULL);
END;
$$;

-- National IDs must never travel through Supabase Auth metadata, which is returned
-- to the browser. Registration sends the raw value directly to this TLS RPC.
CREATE OR REPLACE FUNCTION public.complete_mobilizer_registration(p_national_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_profile public.profiles; v_id TEXT; v_hash TEXT;
BEGIN
  v_profile := private.require_roles(ARRAY['mobilizer']::public.user_role[], false);
  SELECT * INTO v_profile FROM public.profiles WHERE id=auth.uid() FOR UPDATE;
  IF v_profile.status <> 'pending' OR v_profile.national_id_hash IS NOT NULL THEN
    RAISE EXCEPTION 'Registration details can only be submitted once while pending';
  END IF;
  IF btrim(coalesce(p_national_id,'')) !~ '^[0-9]{7,8}$' THEN
    RAISE EXCEPTION 'National ID must contain 7 or 8 digits' USING ERRCODE = '23514';
  END IF;
  v_id := p_national_id;
  v_hash := private.hash_national_id(v_id);
  UPDATE public.profiles
  SET national_id_masked=private.mask_national_id(v_id),
      national_id_hash=v_hash,
      national_id_encrypted=private.encrypt_national_id(v_id),
      updated_at=now()
  WHERE id=v_profile.id;
  PERFORM private.audit_event('MOBILIZER_REGISTRATION_ID','profiles',v_profile.id::text,NULL,
    jsonb_build_object('id_registered',true),'Mobilizer registration details submitted');
  RETURN jsonb_build_object('registered',true,'national_id_masked',private.mask_national_id(v_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.search_entries(p_query TEXT, p_ward_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_profile public.profiles; v_query TEXT := btrim(coalesce(p_query, '')); v_clean_id TEXT; v_hash TEXT; v_results JSONB;
BEGIN
  v_profile := private.require_roles(ARRAY['admin','ward_coordinator','mobilizer']::public.user_role[], true);
  v_clean_id := private.clean_national_id(v_query);
  IF length(v_query) < 3 AND (v_clean_id IS NULL OR length(v_clean_id) NOT IN (7,8)) THEN
    RAISE EXCEPTION 'Search requires at least 3 characters or a full 7/8 digit ID';
  END IF;
  PERFORM private.consume_rate_limit('entry_search', v_profile.id::text, 60, 60);
  IF v_clean_id IS NOT NULL AND length(v_clean_id) IN (7,8) THEN v_hash := private.hash_national_id(v_clean_id); END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) INTO v_results
  FROM (
    SELECT e.id, e.name, e.id_masked, e.phone_e164, e.ward_filed_id, w.name AS ward_name,
           e.polling_centre_id, pc.name AS polling_centre_name, e.polling_station_id, ps.station_name AS polling_station_name,
           e.verification_status, e.flags
    FROM public.entries e
    JOIN public.wards w ON w.id = e.ward_filed_id
    LEFT JOIN public.polling_centres pc ON pc.id = e.polling_centre_id
    LEFT JOIN public.polling_stations ps ON ps.id = e.polling_station_id
    WHERE ((v_hash IS NOT NULL AND e.id_hash = v_hash)
       OR (v_hash IS NULL AND extensions.similarity(e.name, v_query) >= 0.25))
    AND (v_profile.role = 'admin'
      OR (v_profile.role = 'ward_coordinator' AND e.ward_filed_id = v_profile.home_ward_id)
      OR (v_profile.role = 'mobilizer' AND e.mobilizer_id = v_profile.id))
    AND (p_ward_id IS NULL OR e.ward_filed_id = p_ward_id)
    ORDER BY CASE WHEN v_hash IS NOT NULL AND e.id_hash = v_hash THEN 0 ELSE 1 END,
             extensions.similarity(e.name, v_query) DESC
    LIMIT 10
  ) q;
  RETURN jsonb_build_object('results', v_results, 'limit', 10);
END;
$$;

CREATE OR REPLACE FUNCTION private.generate_referral_code()
RETURNS VARCHAR(6)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_code VARCHAR(6);
BEGIN
  LOOP
    v_code := upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE referral_code = v_code);
  END LOOP;
  RETURN v_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_mobilizer(p_profile_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_actor public.profiles; v_target public.profiles; v_old JSONB; v_code VARCHAR(6);
BEGIN
  v_actor := private.require_roles(ARRAY['admin','ward_coordinator']::public.user_role[], true);
  IF NULLIF(btrim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Reason is required'; END IF;
  SELECT * INTO v_target FROM public.profiles WHERE id = p_profile_id FOR UPDATE;
  IF NOT FOUND OR v_target.role <> 'mobilizer' THEN RAISE EXCEPTION 'Mobilizer not found'; END IF;
  IF v_actor.role = 'ward_coordinator' AND v_target.home_ward_id IS DISTINCT FROM v_actor.home_ward_id THEN
    RAISE EXCEPTION 'Coordinator can only approve mobilizers in their ward' USING ERRCODE = '42501';
  END IF;
  v_old := jsonb_build_object('status', v_target.status, 'referral_code', v_target.referral_code);
  v_code := coalesce(v_target.referral_code, private.generate_referral_code());
  UPDATE public.profiles SET status='approved', referral_code=v_code, approved_by=v_actor.id, approved_at=now(), updated_at=now()
  WHERE id=p_profile_id;
  PERFORM private.audit_event('APPROVE_MOBILIZER','profiles',p_profile_id::text,v_old,
    jsonb_build_object('status','approved','referral_code',v_code),p_reason);
  RETURN jsonb_build_object('id',p_profile_id,'status','approved','referral_code',v_code);
END;
$$;

CREATE OR REPLACE FUNCTION public.suspend_mobilizer(p_profile_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_actor public.profiles; v_target public.profiles; v_old JSONB;
BEGIN
  v_actor := private.require_roles(ARRAY['admin']::public.user_role[], true);
  IF NULLIF(btrim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Reason is required'; END IF;
  SELECT * INTO v_target FROM public.profiles WHERE id = p_profile_id FOR UPDATE;
  IF NOT FOUND OR v_target.role <> 'mobilizer' THEN RAISE EXCEPTION 'Mobilizer not found'; END IF;
  v_old := jsonb_build_object('status',v_target.status,'referral_code',v_target.referral_code);
  UPDATE public.profiles SET status='suspended', updated_at=now() WHERE id=p_profile_id;
  PERFORM private.audit_event('SUSPEND_MOBILIZER','profiles',p_profile_id::text,v_old,jsonb_build_object('status','suspended'),p_reason);
  RETURN jsonb_build_object('id',p_profile_id,'status','suspended');
END;
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_ward_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_entry(UUID,TEXT,TEXT,TEXT,UUID,UUID,UUID,TEXT,TEXT,public.support_level,TEXT[],BOOLEAN,BOOLEAN,TEXT,BOOLEAN,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_mobilizer_registration(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_entries(TEXT,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_mobilizer(UUID,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.suspend_mobilizer(UUID,TEXT) TO authenticated;
