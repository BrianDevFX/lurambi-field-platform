CREATE OR REPLACE FUNCTION public.consume_public_rate_limit(p_scope TEXT,p_subject TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_secret TEXT; v_subject_hash TEXT; v_subject TEXT; v_window_seconds INTEGER; v_limit INTEGER; v_window TIMESTAMPTZ; v_count INTEGER;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service_role only' USING ERRCODE='42501'; END IF;
  IF NULLIF(btrim(p_subject),'') IS NULL OR length(p_subject)>512 THEN RAISE EXCEPTION 'Invalid rate-limit subject'; END IF;
  CASE p_scope
    WHEN 'join_ip' THEN v_limit:=10; v_window_seconds:=60;
    WHEN 'join_code' THEN v_limit:=5; v_window_seconds:=3600;
    WHEN 'dsr_ip' THEN v_limit:=3; v_window_seconds:=3600;
    WHEN 'dsr_subject' THEN v_limit:=2; v_window_seconds:=86400;
    ELSE RAISE EXCEPTION 'Unknown rate-limit scope';
  END CASE;
  v_secret:=private.get_app_secret('id_hmac_secret');
  v_subject:=lower(btrim(p_subject));
  IF p_scope='dsr_subject' THEN v_subject:=coalesce(public.normalize_kenyan_phone(p_subject),v_subject); END IF;
  v_subject_hash:=encode(extensions.hmac(convert_to(v_subject,'UTF8'),convert_to(v_secret,'UTF8'),'sha256'),'hex');
  v_window:=to_timestamp(floor(extract(epoch FROM now())/v_window_seconds)*v_window_seconds);
  INSERT INTO public.rate_limits(scope,subject_hash,window_start,hit_count,updated_at)
  VALUES(p_scope,v_subject_hash,v_window,1,now())
  ON CONFLICT(scope,subject_hash,window_start) DO UPDATE SET hit_count=public.rate_limits.hit_count+1,updated_at=now()
  RETURNING hit_count INTO v_count;
  RETURN jsonb_build_object('allowed',v_count<=v_limit);
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_data_subject_request(
  p_request_type TEXT,p_name TEXT,p_phone TEXT,p_national_id TEXT,p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_name TEXT; v_phone TEXT; v_clean_id TEXT; v_id_hash TEXT; v_request_id UUID;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service_role only' USING ERRCODE='42501'; END IF;
  IF p_request_type NOT IN ('access','correction','deletion') THEN RAISE EXCEPTION 'Invalid request type'; END IF;
  v_name:=NULLIF(btrim(p_name),''); v_phone:=public.normalize_kenyan_phone(p_phone); v_clean_id:=private.clean_national_id(p_national_id);
  IF v_name IS NULL OR length(v_name)>120 OR v_phone IS NULL OR (v_clean_id IS NOT NULL AND length(v_clean_id) NOT IN (7,8)) THEN RAISE EXCEPTION 'Invalid request details'; END IF;
  IF v_clean_id IS NOT NULL THEN v_id_hash:=private.hash_national_id(v_clean_id); END IF;
  INSERT INTO public.data_subject_requests(request_type,requester_name,phone_e164,national_id_hash,notes)
  VALUES(p_request_type,v_name,v_phone,v_id_hash,NULLIF(btrim(p_notes),'')) RETURNING id INTO v_request_id;
  RETURN jsonb_build_object('received',true,'request_id',v_request_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_dsr_request(p_request_id UUID,p_status TEXT,p_notes TEXT,p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_actor public.profiles; v_old JSONB; v_new JSONB;
BEGIN
  v_actor:=private.require_roles(ARRAY['admin']::public.user_role[],true);
  IF p_status NOT IN ('pending','in_progress','completed','rejected') OR NULLIF(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Valid status and reason are required'; END IF;
  SELECT jsonb_build_object('status',status,'notes',notes,'resolved_by',resolved_by,'resolved_at',resolved_at) INTO v_old FROM public.data_subject_requests WHERE id=p_request_id FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  UPDATE public.data_subject_requests SET status=p_status,notes=NULLIF(btrim(p_notes),''),resolved_by=CASE WHEN p_status IN ('completed','rejected') THEN v_actor.id ELSE NULL END,resolved_at=CASE WHEN p_status IN ('completed','rejected') THEN now() ELSE NULL END WHERE id=p_request_id;
  SELECT jsonb_build_object('status',status,'notes',notes,'resolved_by',resolved_by,'resolved_at',resolved_at) INTO v_new FROM public.data_subject_requests WHERE id=p_request_id;
  PERFORM private.audit_event('UPDATE_DSR_REQUEST','data_subject_requests',p_request_id::text,v_old,v_new,p_reason);
  RETURN jsonb_build_object('id',p_request_id,'updated',true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_confirm_legacy_consent(p_entry_id UUID,p_evidence_note TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_actor public.profiles; v_entry public.entries; v_policy JSONB; v_old JSONB;
BEGIN
  v_actor:=private.require_roles(ARRAY['admin']::public.user_role[],true);
  IF NULLIF(btrim(p_evidence_note),'') IS NULL THEN RAISE EXCEPTION 'Evidence note is required'; END IF;
  SELECT value INTO v_policy FROM public.settings WHERE key='consent_policy';
  IF coalesce((v_policy->>'enabled')::boolean,false)=false OR NULLIF(btrim(v_policy->>'version'),'') IS NULL THEN RAISE EXCEPTION 'Current consent policy is not enabled'; END IF;
  SELECT * INTO v_entry FROM public.entries WHERE id=p_entry_id FOR UPDATE;
  IF NOT FOUND OR v_entry.consent_status<>'legacy_unconfirmed' THEN RAISE EXCEPTION 'Legacy unconfirmed entry not found'; END IF;
  v_old:=jsonb_build_object('consent_status',v_entry.consent_status,'consent_at',v_entry.consent_at,'consent_text_version',v_entry.consent_text_version);
  UPDATE public.entries SET consent_status='given',consent_at=now(),consent_text_version=v_policy->>'version',updated_at=now() WHERE id=p_entry_id;
  PERFORM private.audit_event('CONFIRM_LEGACY_CONSENT','entries',p_entry_id::text,v_old,jsonb_build_object('consent_status','given','consent_at',now(),'consent_text_version',v_policy->>'version'),p_evidence_note);
  RETURN jsonb_build_object('id',p_entry_id,'confirmed',true);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_public_rate_limit(TEXT,TEXT) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.submit_data_subject_request(TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.admin_update_dsr_request(UUID,TEXT,TEXT,TEXT) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.admin_confirm_legacy_consent(UUID,TEXT) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.consume_public_rate_limit(TEXT,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_data_subject_request(TEXT,TEXT,TEXT,TEXT,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_dsr_request(UUID,TEXT,TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_confirm_legacy_consent(UUID,TEXT) TO authenticated;
