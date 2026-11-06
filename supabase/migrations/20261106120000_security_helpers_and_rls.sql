CREATE OR REPLACE FUNCTION private.get_app_secret(p_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v TEXT;
BEGIN
  SELECT value INTO v FROM private.app_secrets WHERE name = p_name;
  IF v IS NULL OR length(v) < 32 THEN
    RAISE EXCEPTION 'Required private application secret is not configured';
  END IF;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION private.clean_national_id(p_id TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$ SELECT NULLIF(regexp_replace(coalesce(p_id, ''), '[^0-9]', '', 'g'), '') $$;

CREATE OR REPLACE FUNCTION private.hash_national_id(p_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_id TEXT := private.clean_national_id(p_id);
BEGIN
  IF v_id IS NULL OR length(v_id) NOT IN (7, 8) THEN RETURN NULL; END IF;
  RETURN encode(extensions.hmac(convert_to(v_id, 'UTF8'), convert_to(private.get_app_secret('id_hmac_secret'), 'UTF8'), 'sha256'), 'hex');
END;
$$;

CREATE OR REPLACE FUNCTION private.encrypt_national_id(p_id TEXT)
RETURNS BYTEA
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_id TEXT := private.clean_national_id(p_id);
BEGIN
  IF v_id IS NULL THEN RETURN NULL; END IF;
  RETURN extensions.pgp_sym_encrypt(v_id, private.get_app_secret('id_encryption_key'), 'cipher-algo=aes256, compress-algo=0');
END;
$$;

CREATE OR REPLACE FUNCTION private.mask_national_id(p_id TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN length(private.clean_national_id(p_id)) >= 4
    THEN left(private.clean_national_id(p_id), 2) || repeat('*', greatest(2, length(private.clean_national_id(p_id)) - 5)) || right(private.clean_national_id(p_id), 3)
    ELSE NULL END
$$;

CREATE OR REPLACE FUNCTION public.normalize_kenyan_phone(p_phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE v TEXT := regexp_replace(trim(coalesce(p_phone, '')), '[^0-9]', '', 'g');
BEGIN
  IF length(v) = 9 AND (left(v, 1) = '7' OR left(v, 1) = '1') THEN RETURN '+254' || v; END IF;
  IF length(v) = 10 AND (left(v, 2) = '07' OR left(v, 2) = '01') THEN RETURN '+254' || substring(v FROM 2); END IF;
  IF length(v) = 12 AND (left(v, 4) = '2547' OR left(v, 4) = '2541') THEN RETURN '+' || v; END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ SELECT role FROM public.profiles WHERE id = auth.uid() $$;

CREATE OR REPLACE FUNCTION public.current_ward_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ SELECT home_ward_id FROM public.profiles WHERE id = auth.uid() $$;

CREATE OR REPLACE FUNCTION private.require_roles(p_roles public.user_role[], p_approved BOOLEAN DEFAULT true)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_profile public.profiles;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
  IF NOT FOUND OR NOT (v_profile.role = ANY(p_roles)) THEN RAISE EXCEPTION 'Role not permitted' USING ERRCODE = '42501'; END IF;
  IF p_approved AND v_profile.status <> 'approved' THEN RAISE EXCEPTION 'Account is not approved' USING ERRCODE = '42501'; END IF;
  RETURN v_profile;
END;
$$;

CREATE OR REPLACE FUNCTION private.audit_event(
  p_action TEXT, p_entity_type TEXT, p_entity_id TEXT,
  p_old JSONB, p_new JSONB, p_reason TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_profile public.profiles; v_id UUID := gen_random_uuid();
BEGIN
  IF auth.uid() IS NOT NULL THEN SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid(); END IF;
  INSERT INTO public.audit_log(id, user_id, user_email, user_role, action, entity_type, entity_id, old_values, new_values, reason)
  VALUES (v_id, auth.uid(), v_profile.email, v_profile.role::text, p_action, p_entity_type, p_entity_id, p_old, p_new, NULLIF(btrim(p_reason), ''));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION private.audit_log_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ BEGIN RAISE EXCEPTION 'audit_log is append-only' USING ERRCODE = '42501'; END; $$;

DROP TRIGGER IF EXISTS audit_log_no_change ON public.audit_log;
CREATE TRIGGER audit_log_no_change BEFORE UPDATE OR DELETE ON public.audit_log
FOR EACH ROW EXECUTE FUNCTION private.audit_log_immutable();

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_meta JSONB := coalesce(NEW.raw_user_meta_data, '{}'::jsonb);
        v_phone TEXT := public.normalize_kenyan_phone(v_meta->>'phone_e164');
        v_ward UUID;
        v_station UUID;
BEGIN
  BEGIN v_ward := NULLIF(v_meta->>'home_ward_id', '')::uuid; EXCEPTION WHEN invalid_text_representation THEN v_ward := NULL; END;
  BEGIN v_station := NULLIF(v_meta->>'home_polling_station_id', '')::uuid; EXCEPTION WHEN invalid_text_representation THEN v_station := NULL; END;
  INSERT INTO public.profiles (id, email, full_name, phone_e164, national_id_masked, national_id_hash, national_id_encrypted, role, status, home_ward_id, home_polling_station_id)
  VALUES (
    NEW.id, NEW.email, coalesce(NULLIF(btrim(v_meta->>'full_name'), ''), 'Pending mobilizer'), v_phone,
    NULL, NULL, NULL,
    'mobilizer', 'pending', v_ward, v_station
  );
  IF v_meta ? 'national_id' THEN
    UPDATE auth.users SET raw_user_meta_data=raw_user_meta_data - 'national_id' WHERE id=NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- All tables are RLS-enabled in the preceding migration. Table writes are only
-- available through checked SECURITY DEFINER RPCs.
GRANT SELECT (id,email,full_name,phone_e164,national_id_masked,role,status,home_ward_id,home_polling_station_id,referral_code,approved_by,approved_at,last_active_at,created_at,updated_at)
  ON public.profiles TO authenticated;
GRANT SELECT ON public.wards, public.polling_centres, public.polling_stations, public.place_aliases TO authenticated;
GRANT SELECT (id,client_request_id,mobilizer_id,ward_filed_id,polling_centre_id,polling_station_id,register_voter_id,name,phone_e164,id_masked,support_level,issues,needs_transport,has_pvc,notes,consent_at,consent_text_version,consent_status,source,verification_status,verification_notes,verified_by,verified_at,legacy_mobilizer_label,captured_on,import_batch_id,flags,created_at,updated_at)
  ON public.entries TO authenticated;
GRANT SELECT ON public.flag_events TO authenticated;
GRANT SELECT (id,mobilizer_id,matched_entry_id,attempted_name,attempted_phone,attempted_ward_id,match_reason,created_at)
  ON public.duplicate_attempts TO authenticated;
GRANT SELECT (id,type,name,phone_e164,denomination,community_unit,sub_county,ward_id,polling_station_id,reach_status,notes,exclude_from_campaign_exports,created_at,updated_at)
  ON public.network_contacts TO authenticated;
GRANT SELECT ON public.imports, public.exports_log, public.audit_log, public.settings, public.data_subject_requests, public.rate_limits TO authenticated;

CREATE POLICY profiles_select_self ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY profiles_select_coordinator_ward ON public.profiles FOR SELECT TO authenticated
  USING (public.current_user_role() = 'ward_coordinator' AND role = 'mobilizer' AND home_ward_id = public.current_ward_id());
CREATE POLICY profiles_select_admin ON public.profiles FOR SELECT TO authenticated USING (public.current_user_role() = 'admin');

CREATE POLICY wards_read_authenticated ON public.wards FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY centres_read_authenticated ON public.polling_centres FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY stations_read_authenticated ON public.polling_stations FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY aliases_read_authenticated ON public.place_aliases FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY entries_select_own ON public.entries FOR SELECT TO authenticated
  USING (mobilizer_id = auth.uid() AND public.current_user_role() = 'mobilizer');
CREATE POLICY entries_select_coordinator_ward ON public.entries FOR SELECT TO authenticated
  USING (public.current_user_role() = 'ward_coordinator' AND ward_filed_id = public.current_ward_id());
CREATE POLICY entries_select_admin ON public.entries FOR SELECT TO authenticated
  USING (public.current_user_role() = 'admin');

CREATE POLICY flags_admin_read ON public.flag_events FOR SELECT TO authenticated USING (public.current_user_role() = 'admin');
CREATE POLICY duplicate_attempts_admin_read ON public.duplicate_attempts FOR SELECT TO authenticated USING (public.current_user_role() = 'admin');
CREATE POLICY contacts_admin_read ON public.network_contacts FOR SELECT TO authenticated USING (public.current_user_role() = 'admin');
CREATE POLICY contacts_coordinator_read_ward ON public.network_contacts FOR SELECT TO authenticated
  USING (public.current_user_role() = 'ward_coordinator' AND ward_id = public.current_ward_id());
CREATE POLICY imports_admin_read ON public.imports FOR SELECT TO authenticated USING (public.current_user_role() = 'admin');
CREATE POLICY exports_admin_read ON public.exports_log FOR SELECT TO authenticated USING (public.current_user_role() = 'admin');
CREATE POLICY audit_admin_read ON public.audit_log FOR SELECT TO authenticated USING (public.current_user_role() = 'admin');
CREATE POLICY settings_authenticated_read ON public.settings FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY dsr_admin_read ON public.data_subject_requests FOR SELECT TO authenticated USING (public.current_user_role() = 'admin');
CREATE POLICY rate_limits_admin_read ON public.rate_limits FOR SELECT TO authenticated USING (public.current_user_role() = 'admin');

REVOKE ALL ON FUNCTION private.get_app_secret(TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.hash_national_id(TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.encrypt_national_id(TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.clean_national_id(TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.mask_national_id(TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.require_roles(public.user_role[], BOOLEAN) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.audit_event(TEXT, TEXT, TEXT, JSONB, JSONB, TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.audit_log_immutable() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.normalize_kenyan_phone(TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.current_ward_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_ward_id() TO authenticated;
