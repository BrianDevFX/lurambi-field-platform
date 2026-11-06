-- Publicly readable hierarchy labels support account registration before sign-in.
CREATE OR REPLACE FUNCTION public.list_registration_wards()
RETURNS TABLE(id UUID, name TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT w.id, w.name FROM public.wards w ORDER BY w.name
$$;

CREATE OR REPLACE FUNCTION public.list_registration_stations()
RETURNS TABLE(id UUID, station_name TEXT, polling_centre_id UUID, ward_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT s.id, s.station_name, s.polling_centre_id, s.ward_id
  FROM public.polling_stations s
  ORDER BY s.station_name
$$;

-- Extend the checked, rate-limited search RPC to support a full normalized phone.
CREATE OR REPLACE FUNCTION public.search_entries(p_query TEXT, p_ward_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile public.profiles;
  v_query TEXT := btrim(coalesce(p_query, ''));
  v_clean_id TEXT;
  v_hash TEXT;
  v_phone TEXT;
  v_results JSONB;
BEGIN
  v_profile := private.require_roles(ARRAY['admin','ward_coordinator','mobilizer']::public.user_role[], true);
  v_clean_id := private.clean_national_id(v_query);
  IF length(v_query) < 3 AND (v_clean_id IS NULL OR length(v_clean_id) NOT IN (7,8)) THEN
    RAISE EXCEPTION 'Search requires at least 3 characters or a full 7/8 digit ID';
  END IF;
  PERFORM private.consume_rate_limit('entry_search', v_profile.id::text, 60, 60);
  IF v_clean_id IS NOT NULL AND length(v_clean_id) IN (7,8) THEN
    v_hash := private.hash_national_id(v_clean_id);
  END IF;
  v_phone := public.normalize_kenyan_phone(v_query);
  SELECT coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) INTO v_results
  FROM (
    SELECT e.id, e.name, e.id_masked, e.phone_e164, e.ward_filed_id, w.name AS ward_name,
           e.polling_centre_id, pc.name AS polling_centre_name, e.polling_station_id,
           ps.station_name AS polling_station_name, e.verification_status, e.flags
    FROM public.entries e
    JOIN public.wards w ON w.id = e.ward_filed_id
    LEFT JOIN public.polling_centres pc ON pc.id = e.polling_centre_id
    LEFT JOIN public.polling_stations ps ON ps.id = e.polling_station_id
    WHERE ((v_hash IS NOT NULL AND e.id_hash = v_hash)
       OR (v_hash IS NULL AND v_phone IS NOT NULL AND e.phone_e164 = v_phone)
       OR (v_hash IS NULL AND extensions.similarity(e.name, v_query) >= 0.25))
      AND (v_profile.role = 'admin'
        OR (v_profile.role = 'ward_coordinator' AND e.ward_filed_id = v_profile.home_ward_id)
        OR (v_profile.role = 'mobilizer' AND e.mobilizer_id = v_profile.id))
      AND (p_ward_id IS NULL OR e.ward_filed_id = p_ward_id)
    ORDER BY CASE WHEN v_hash IS NOT NULL AND e.id_hash = v_hash THEN 0
                  WHEN v_phone IS NOT NULL AND e.phone_e164 = v_phone THEN 1 ELSE 2 END,
             extensions.similarity(e.name, v_query) DESC
    LIMIT 10
  ) q;
  RETURN jsonb_build_object('results', v_results, 'limit', 10);
END;
$$;

REVOKE ALL ON FUNCTION public.list_registration_wards() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_registration_stations() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_registration_wards() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_registration_stations() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_entries(TEXT, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION private.validate_profile_home_station()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.home_polling_station_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.polling_stations s
    WHERE s.id=NEW.home_polling_station_id AND s.ward_id=NEW.home_ward_id
  ) THEN
    RAISE EXCEPTION 'Home polling station must belong to the selected ward';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_validate_home_station ON public.profiles;
CREATE TRIGGER profiles_validate_home_station
BEFORE INSERT OR UPDATE OF home_ward_id, home_polling_station_id ON public.profiles
FOR EACH ROW EXECUTE FUNCTION private.validate_profile_home_station();
REVOKE ALL ON FUNCTION private.validate_profile_home_station() FROM PUBLIC, anon, authenticated, service_role;
