CREATE OR REPLACE FUNCTION public.admin_update_setting(p_key TEXT, p_value JSONB, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_actor public.profiles; v_old JSONB;
BEGIN
  v_actor := private.require_roles(ARRAY['admin']::public.user_role[], true);
  IF p_key NOT IN ('consent_policy','verification_providers','share_message_template','issue_categories','chp_compliance_note','exclude_legacy_unconfirmed_from_outreach') THEN
    RAISE EXCEPTION 'Setting is not editable';
  END IF;
  IF p_value IS NULL OR NULLIF(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Value and reason are required'; END IF;
  IF p_key='verification_providers' AND (coalesce((p_value->>'external_link_enabled')::boolean,false)
    OR coalesce((p_value->>'register_import_enabled')::boolean,false)) THEN
    RAISE EXCEPTION 'Automated verification providers are disabled in this build';
  END IF;
  IF p_key='consent_policy' AND coalesce((p_value->>'enabled')::boolean,false)
    AND (NULLIF(btrim(p_value->>'version'),'') IS NULL OR NULLIF(btrim(p_value->>'text'),'') IS NULL) THEN
    RAISE EXCEPTION 'Enabled consent requires approved wording and a version';
  END IF;
  SELECT value INTO v_old FROM public.settings WHERE key=p_key FOR UPDATE;
  INSERT INTO public.settings(key,value,updated_by,updated_at)
  VALUES(p_key,p_value,v_actor.id,now())
  ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=now();
  PERFORM private.audit_event('UPDATE_SETTING','settings',p_key,v_old,p_value,p_reason);
  RETURN jsonb_build_object('key',p_key,'updated',true);
END;
$$;

UPDATE public.settings SET value=jsonb_set(jsonb_set(value,'{register_import_enabled}','false'::jsonb,true),'{external_link_enabled}','false'::jsonb,true),updated_at=now()
WHERE key='verification_providers';

CREATE OR REPLACE FUNCTION public.set_verification(p_entry_id UUID, p_status public.verification_status, p_evidence_note TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_actor public.profiles; v_old JSONB; v_provider_settings JSONB;
BEGIN
  v_actor:=private.require_roles(ARRAY['admin']::public.user_role[],true);
  SELECT value INTO v_provider_settings FROM public.settings WHERE key='verification_providers';
  IF coalesce((v_provider_settings->>'manual_enabled')::boolean,true)=false THEN RAISE EXCEPTION 'Manual verification is disabled'; END IF;
  IF NULLIF(btrim(p_evidence_note),'') IS NULL THEN RAISE EXCEPTION 'Evidence note is required'; END IF;
  SELECT jsonb_build_object('verification_status',verification_status,'verification_notes',verification_notes) INTO v_old
  FROM public.entries WHERE id=p_entry_id FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Entry not found'; END IF;
  UPDATE public.entries SET verification_status=p_status,verification_notes=p_evidence_note,verified_by=v_actor.id,verified_at=now(),updated_at=now() WHERE id=p_entry_id;
  PERFORM private.audit_event('SET_VERIFICATION','entries',p_entry_id::text,v_old,jsonb_build_object('verification_status',p_status,'verification_notes',p_evidence_note),p_evidence_note);
  RETURN jsonb_build_object('id',p_entry_id,'verification_status',p_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.bulk_set_verification_by_id(p_rows JSONB, p_evidence_note TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor public.profiles; v_row JSONB; v_id TEXT; v_hash TEXT; v_status public.verification_status;
  v_entry_id UUID; v_updated INTEGER:=0; v_not_found INTEGER:=0; v_invalid INTEGER:=0;
BEGIN
  v_actor:=private.require_roles(ARRAY['admin']::public.user_role[],true);
  IF jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows)>500 THEN RAISE EXCEPTION 'Rows must be an array of at most 500'; END IF;
  IF NULLIF(btrim(p_evidence_note),'') IS NULL THEN RAISE EXCEPTION 'Evidence note is required'; END IF;
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v_id:=private.clean_national_id(v_row->>'national_id');
    IF v_id IS NULL OR length(v_id) NOT IN (7,8) THEN v_invalid:=v_invalid+1; CONTINUE; END IF;
    BEGIN v_status:=(v_row->>'status')::public.verification_status;
    EXCEPTION WHEN invalid_text_representation THEN v_invalid:=v_invalid+1; CONTINUE; END;
    v_hash:=private.hash_national_id(v_id);
    SELECT id INTO v_entry_id FROM public.entries WHERE id_hash=v_hash LIMIT 1;
    IF v_entry_id IS NULL THEN v_not_found:=v_not_found+1; CONTINUE; END IF;
    PERFORM public.set_verification(v_entry_id,v_status,p_evidence_note);
    v_updated:=v_updated+1;
  END LOOP;
  RETURN jsonb_build_object('updated',v_updated,'not_found',v_not_found,'invalid',v_invalid);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_upsert_place(
  p_type public.canonical_type, p_place_id UUID, p_name TEXT, p_ward_id UUID,
  p_centre_id UUID, p_station_number INTEGER, p_code TEXT, p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_actor public.profiles; v_old JSONB; v_new JSONB; v_id UUID; v_parent UUID;
BEGIN
  v_actor:=private.require_roles(ARRAY['admin']::public.user_role[],true);
  IF p_type IS NULL OR NULLIF(btrim(p_name),'') IS NULL OR length(p_name)>160 OR NULLIF(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Place type, name and reason are required'; END IF;
  IF p_type='ward' THEN
    IF p_place_id IS NULL THEN
      INSERT INTO public.wards(name,code) VALUES(btrim(p_name),NULLIF(btrim(p_code),'')) RETURNING id INTO v_id;
    ELSE
      SELECT jsonb_build_object('name',name,'code',code,'registered_voters_target',registered_voters_target) INTO v_old FROM public.wards WHERE id=p_place_id FOR UPDATE;
      IF v_old IS NULL THEN RAISE EXCEPTION 'Ward not found'; END IF;
      UPDATE public.wards SET name=btrim(p_name),code=NULLIF(btrim(p_code),''),updated_at=now() WHERE id=p_place_id RETURNING id INTO v_id;
    END IF;
    SELECT jsonb_build_object('name',name,'code',code,'registered_voters_target',registered_voters_target) INTO v_new FROM public.wards WHERE id=v_id;
  ELSIF p_type='polling_centre' THEN
    IF p_ward_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.wards WHERE id=p_ward_id) THEN RAISE EXCEPTION 'A valid ward is required'; END IF;
    IF p_place_id IS NULL THEN
      INSERT INTO public.polling_centres(ward_id,name,code) VALUES(p_ward_id,btrim(p_name),NULLIF(btrim(p_code),'')) RETURNING id INTO v_id;
    ELSE
      SELECT jsonb_build_object('ward_id',ward_id,'name',name,'code',code) INTO v_old FROM public.polling_centres WHERE id=p_place_id FOR UPDATE;
      IF v_old IS NULL THEN RAISE EXCEPTION 'Polling centre not found'; END IF;
      v_parent:=(v_old->>'ward_id')::uuid;
      IF v_parent<>p_ward_id AND (EXISTS(SELECT 1 FROM public.polling_stations WHERE polling_centre_id=p_place_id) OR EXISTS(SELECT 1 FROM public.entries WHERE polling_centre_id=p_place_id)) THEN RAISE EXCEPTION 'Reassign dependent entries and stations before changing a centre ward'; END IF;
      UPDATE public.polling_centres SET ward_id=p_ward_id,name=btrim(p_name),code=NULLIF(btrim(p_code),''),updated_at=now() WHERE id=p_place_id RETURNING id INTO v_id;
    END IF;
    SELECT jsonb_build_object('ward_id',ward_id,'name',name,'code',code) INTO v_new FROM public.polling_centres WHERE id=v_id;
  ELSE
    IF p_centre_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.polling_centres WHERE id=p_centre_id) THEN RAISE EXCEPTION 'A valid polling centre is required'; END IF;
    SELECT ward_id INTO p_ward_id FROM public.polling_centres WHERE id=p_centre_id;
    IF p_station_number IS NULL OR p_station_number<1 THEN RAISE EXCEPTION 'Station number must be positive'; END IF;
    IF p_place_id IS NULL THEN
      INSERT INTO public.polling_stations(polling_centre_id,ward_id,station_name,station_number) VALUES(p_centre_id,p_ward_id,btrim(p_name),p_station_number) RETURNING id INTO v_id;
    ELSE
      SELECT jsonb_build_object('polling_centre_id',polling_centre_id,'ward_id',ward_id,'station_name',station_name,'station_number',station_number) INTO v_old FROM public.polling_stations WHERE id=p_place_id FOR UPDATE;
      IF v_old IS NULL THEN RAISE EXCEPTION 'Polling station not found'; END IF;
      v_parent:=(v_old->>'polling_centre_id')::uuid;
      IF v_parent<>p_centre_id AND (EXISTS(SELECT 1 FROM public.entries WHERE polling_station_id=p_place_id) OR EXISTS(SELECT 1 FROM public.profiles WHERE home_polling_station_id=p_place_id) OR EXISTS(SELECT 1 FROM public.network_contacts WHERE polling_station_id=p_place_id)) THEN RAISE EXCEPTION 'Reassign dependent records before moving this station'; END IF;
      UPDATE public.polling_stations SET polling_centre_id=p_centre_id,ward_id=p_ward_id,station_name=btrim(p_name),station_number=p_station_number,updated_at=now() WHERE id=p_place_id RETURNING id INTO v_id;
    END IF;
    SELECT jsonb_build_object('polling_centre_id',polling_centre_id,'ward_id',ward_id,'station_name',station_name,'station_number',station_number) INTO v_new FROM public.polling_stations WHERE id=v_id;
  END IF;
  PERFORM private.audit_event('UPSERT_PLACE',p_type::text,v_id::text,v_old,v_new,p_reason);
  RETURN jsonb_build_object('id',v_id,'type',p_type,'saved',true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_place(p_type public.canonical_type,p_place_id UUID,p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_actor public.profiles; v_old JSONB; v_used BOOLEAN:=false;
BEGIN
  v_actor:=private.require_roles(ARRAY['admin']::public.user_role[],true);
  IF p_type IS NULL OR p_place_id IS NULL OR NULLIF(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Place type, place and reason are required'; END IF;
  IF p_type='ward' THEN
    SELECT jsonb_build_object('name',name,'code',code) INTO v_old FROM public.wards WHERE id=p_place_id FOR UPDATE;
    IF v_old IS NULL THEN RAISE EXCEPTION 'Ward not found'; END IF;
    SELECT EXISTS(SELECT 1 FROM public.polling_centres WHERE ward_id=p_place_id) OR EXISTS(SELECT 1 FROM public.entries WHERE ward_filed_id=p_place_id) OR EXISTS(SELECT 1 FROM public.profiles WHERE home_ward_id=p_place_id) OR EXISTS(SELECT 1 FROM public.network_contacts WHERE ward_id=p_place_id) OR EXISTS(SELECT 1 FROM public.voter_register WHERE ward_id=p_place_id) INTO v_used;
    IF v_used THEN RAISE EXCEPTION 'Reassign ward records and delete its centres before removing this ward'; END IF;
    IF EXISTS(SELECT 1 FROM public.place_aliases WHERE target_ward_id=p_place_id) THEN RAISE EXCEPTION 'Remove or reassign aliases before removing this ward'; END IF;
    DELETE FROM public.wards WHERE id=p_place_id;
  ELSIF p_type='polling_centre' THEN
    SELECT jsonb_build_object('ward_id',ward_id,'name',name) INTO v_old FROM public.polling_centres WHERE id=p_place_id FOR UPDATE;
    IF v_old IS NULL THEN RAISE EXCEPTION 'Polling centre not found'; END IF;
    SELECT EXISTS(SELECT 1 FROM public.polling_stations WHERE polling_centre_id=p_place_id) OR EXISTS(SELECT 1 FROM public.entries WHERE polling_centre_id=p_place_id) OR EXISTS(SELECT 1 FROM public.network_contacts c JOIN public.polling_stations s ON s.id=c.polling_station_id WHERE s.polling_centre_id=p_place_id) INTO v_used;
    IF v_used THEN RAISE EXCEPTION 'Reassign or remove child stations and records before removing this centre'; END IF;
    IF EXISTS(SELECT 1 FROM public.place_aliases WHERE target_polling_centre_id=p_place_id) THEN RAISE EXCEPTION 'Remove or reassign aliases before removing this centre'; END IF;
    DELETE FROM public.polling_centres WHERE id=p_place_id;
  ELSE
    SELECT jsonb_build_object('polling_centre_id',polling_centre_id,'station_name',station_name,'station_number',station_number) INTO v_old FROM public.polling_stations WHERE id=p_place_id FOR UPDATE;
    IF v_old IS NULL THEN RAISE EXCEPTION 'Polling station not found'; END IF;
    SELECT EXISTS(SELECT 1 FROM public.entries WHERE polling_station_id=p_place_id) OR EXISTS(SELECT 1 FROM public.profiles WHERE home_polling_station_id=p_place_id) OR EXISTS(SELECT 1 FROM public.network_contacts WHERE polling_station_id=p_place_id) INTO v_used;
    IF v_used THEN RAISE EXCEPTION 'Reassign records before removing this station'; END IF;
    IF EXISTS(SELECT 1 FROM public.place_aliases WHERE target_polling_station_id=p_place_id) THEN RAISE EXCEPTION 'Remove or reassign aliases before removing this station'; END IF;
    DELETE FROM public.polling_stations WHERE id=p_place_id;
  END IF;
  PERFORM private.audit_event('DELETE_PLACE',p_type::text,p_place_id::text,v_old,NULL,p_reason);
  RETURN jsonb_build_object('id',p_place_id,'deleted',true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_place_alias(p_alias_id UUID,p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_actor public.profiles; v_old JSONB;
BEGIN
  v_actor:=private.require_roles(ARRAY['admin']::public.user_role[],true);
  IF NULLIF(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Reason is required'; END IF;
  SELECT to_jsonb(a) INTO v_old FROM public.place_aliases a WHERE id=p_alias_id FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Alias not found'; END IF;
  DELETE FROM public.place_aliases WHERE id=p_alias_id;
  PERFORM private.audit_event('DELETE_PLACE_ALIAS','place_aliases',p_alias_id::text,v_old,NULL,p_reason);
  RETURN jsonb_build_object('id',p_alias_id,'deleted',true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_setting(TEXT,JSONB,TEXT) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.bulk_set_verification_by_id(JSONB,TEXT) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.admin_upsert_place(public.canonical_type,UUID,TEXT,UUID,UUID,INTEGER,TEXT,TEXT) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.admin_delete_place(public.canonical_type,UUID,TEXT) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.admin_delete_place_alias(UUID,TEXT) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_setting(TEXT,JSONB,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_set_verification_by_id(JSONB,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_place(public.canonical_type,UUID,TEXT,UUID,UUID,INTEGER,TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_place(public.canonical_type,UUID,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_place_alias(UUID,TEXT) TO authenticated;
