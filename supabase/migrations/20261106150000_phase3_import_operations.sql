CREATE OR REPLACE FUNCTION public.save_place_alias(
  p_type public.canonical_type, p_raw_alias TEXT, p_target_id UUID, p_confidence NUMERIC, p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_actor public.profiles; v_alias public.place_aliases; v_old JSONB;
BEGIN
  v_actor := private.require_roles(ARRAY['admin']::public.user_role[], true);
  IF NULLIF(btrim(p_raw_alias),'') IS NULL OR length(p_raw_alias)>160 OR NULLIF(btrim(p_reason),'') IS NULL THEN
    RAISE EXCEPTION 'Alias and reason are required';
  END IF;
  IF p_confidence < 0 OR p_confidence > 1 THEN RAISE EXCEPTION 'Confidence must be between 0 and 1'; END IF;
  IF p_type='ward' AND NOT EXISTS(SELECT 1 FROM public.wards WHERE id=p_target_id) THEN RAISE EXCEPTION 'Ward not found'; END IF;
  IF p_type='polling_centre' AND NOT EXISTS(SELECT 1 FROM public.polling_centres WHERE id=p_target_id) THEN RAISE EXCEPTION 'Polling centre not found'; END IF;
  IF p_type='polling_station' AND NOT EXISTS(SELECT 1 FROM public.polling_stations WHERE id=p_target_id) THEN RAISE EXCEPTION 'Polling station not found'; END IF;
  SELECT * INTO v_alias FROM public.place_aliases WHERE raw_alias=p_raw_alias AND canonical_type=p_type FOR UPDATE;
  IF FOUND THEN v_old:=to_jsonb(v_alias); END IF;
  INSERT INTO public.place_aliases(raw_alias,canonical_type,target_ward_id,target_polling_centre_id,target_polling_station_id,confidence,notes)
  VALUES(p_raw_alias,p_type,
    CASE WHEN p_type='ward' THEN p_target_id END,
    CASE WHEN p_type='polling_centre' THEN p_target_id END,
    CASE WHEN p_type='polling_station' THEN p_target_id END,
    p_confidence,p_reason)
  ON CONFLICT(raw_alias,canonical_type) DO UPDATE SET
    target_ward_id=EXCLUDED.target_ward_id,target_polling_centre_id=EXCLUDED.target_polling_centre_id,
    target_polling_station_id=EXCLUDED.target_polling_station_id,confidence=EXCLUDED.confidence,notes=EXCLUDED.notes
  RETURNING * INTO v_alias;
  PERFORM private.audit_event('SAVE_PLACE_ALIAS','place_aliases',v_alias.id::text,v_old,to_jsonb(v_alias),p_reason);
  RETURN jsonb_build_object('id',v_alias.id,'raw_alias',v_alias.raw_alias,'canonical_type',v_alias.canonical_type,'confidence',v_alias.confidence);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_network_contact(
  p_contact_id UUID, p_ward_id UUID, p_station_id UUID, p_reach_status public.reach_status,
  p_notes TEXT, p_exclude_from_exports BOOLEAN, p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_actor public.profiles; v_contact public.network_contacts; v_old JSONB; v_new JSONB;
BEGIN
  v_actor := private.require_roles(ARRAY['admin']::public.user_role[], true);
  IF NULLIF(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Reason is required'; END IF;
  IF p_ward_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.wards WHERE id=p_ward_id) THEN RAISE EXCEPTION 'Ward not found'; END IF;
  IF p_station_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.polling_stations WHERE id=p_station_id AND (p_ward_id IS NULL OR ward_id=p_ward_id)) THEN RAISE EXCEPTION 'Station does not belong to the selected ward'; END IF;
  SELECT * INTO v_contact FROM public.network_contacts WHERE id=p_contact_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contact not found'; END IF;
  v_old:=jsonb_build_object('ward_id',v_contact.ward_id,'polling_station_id',v_contact.polling_station_id,'reach_status',v_contact.reach_status,'notes',v_contact.notes,'exclude_from_campaign_exports',v_contact.exclude_from_campaign_exports);
  UPDATE public.network_contacts SET ward_id=p_ward_id,polling_station_id=p_station_id,reach_status=p_reach_status,
    notes=NULLIF(btrim(p_notes),''),exclude_from_campaign_exports=CASE WHEN type='chp' THEN p_exclude_from_exports ELSE false END,updated_at=now()
  WHERE id=p_contact_id
  RETURNING jsonb_build_object('ward_id',ward_id,'polling_station_id',polling_station_id,'reach_status',reach_status,'notes',notes,'exclude_from_campaign_exports',exclude_from_campaign_exports) INTO v_new;
  PERFORM private.audit_event('UPDATE_NETWORK_CONTACT','network_contacts',p_contact_id::text,v_old,v_new,p_reason);
  RETURN jsonb_build_object('id',p_contact_id,'updated',true);
END;
$$;

CREATE OR REPLACE FUNCTION public.import_places_batch(p_import_id UUID,p_file_name TEXT,p_rows JSONB,p_dry_run BOOLEAN DEFAULT false)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor public.profiles; v_row JSONB; v_count INTEGER; v_imported INTEGER:=0; v_rejected INTEGER:=0; v_unmapped INTEGER:=0;
  v_type TEXT; v_name TEXT; v_ward UUID; v_centre UUID; v_station_number INTEGER; v_total_voters INTEGER;
  v_centre_voters INTEGER; v_place RECORD; v_report JSONB;
BEGIN
  v_actor:=private.require_roles(ARRAY['admin']::public.user_role[],true);
  IF p_import_id IS NULL OR jsonb_typeof(p_rows)<>'array' THEN RAISE EXCEPTION 'Import ID and rows array are required'; END IF;
  v_count:=jsonb_array_length(p_rows);
  IF v_count>500 THEN RAISE EXCEPTION 'A batch may contain at most 500 rows'; END IF;
  IF NOT p_dry_run THEN
    INSERT INTO public.imports(id,file_name,import_type,created_by)
    VALUES(p_import_id,coalesce(NULLIF(btrim(p_file_name),''),'places.csv'),'places',v_actor.id)
    ON CONFLICT(id) DO NOTHING;
    IF NOT EXISTS(SELECT 1 FROM public.imports WHERE id=p_import_id AND import_type='places') THEN RAISE EXCEPTION 'Import ID belongs to another import'; END IF;
    SELECT summary_report INTO v_report FROM public.imports WHERE id=p_import_id FOR UPDATE;
    IF NOT coalesce((v_report->>'synthetic_places_replaced')::boolean,false) THEN
      DELETE FROM public.polling_stations WHERE station_name ILIKE 'Synthetic %';
      DELETE FROM public.polling_centres WHERE name ILIKE 'Synthetic %';
      UPDATE public.imports SET summary_report=coalesce(summary_report,'{}'::jsonb)||'{"synthetic_places_replaced":true}'::jsonb WHERE id=p_import_id;
    END IF;
  END IF;
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v_type:=lower(coalesce(v_row->>'type',''));
    v_name:=NULLIF(btrim(v_row->>'name'),'');
    IF v_type NOT IN ('ward','polling_centre','polling_station') OR v_name IS NULL THEN
      v_rejected:=v_rejected+1; CONTINUE;
    END IF;
    BEGIN v_ward:=NULLIF(v_row->>'ward_id','')::uuid; EXCEPTION WHEN invalid_text_representation THEN v_ward:=NULL; END;
    IF v_ward IS NULL AND NULLIF(v_row->>'ward','') IS NOT NULL THEN
      SELECT id INTO v_ward FROM public.wards WHERE lower(btrim(name))=lower(btrim(v_row->>'ward')) LIMIT 1;
    END IF;
    BEGIN v_centre:=NULLIF(v_row->>'polling_centre_id','')::uuid; EXCEPTION WHEN invalid_text_representation THEN v_centre:=NULL; END;
    IF v_centre IS NULL AND NULLIF(v_row->>'polling_centre','') IS NOT NULL THEN
      SELECT id INTO v_centre FROM public.polling_centres WHERE ward_id=v_ward AND lower(btrim(name))=lower(btrim(v_row->>'polling_centre')) LIMIT 1;
    END IF;
    BEGIN v_station_number:=coalesce(NULLIF(v_row->>'station_number','')::integer,1); EXCEPTION WHEN others THEN v_station_number:=1; END;
    BEGIN v_total_voters:=NULLIF(v_row->>'registered_voters','')::integer; EXCEPTION WHEN others THEN v_total_voters:=NULL; END;
    BEGIN v_centre_voters:=NULLIF(v_row->>'total_registered_voters','')::integer; EXCEPTION WHEN others THEN v_centre_voters:=NULL; END;
    IF v_type='ward' THEN
      IF NOT p_dry_run THEN
        INSERT INTO public.wards(name,code,constituency_name,county_name,registered_voters_target)
        VALUES(v_name,NULLIF(btrim(v_row->>'code'),''),coalesce(NULLIF(v_row->>'constituency_name',''),'Lurambi'),coalesce(NULLIF(v_row->>'county_name',''),'Kakamega'),v_total_voters)
        ON CONFLICT(name) DO UPDATE SET code=coalesce(EXCLUDED.code,public.wards.code),registered_voters_target=coalesce(EXCLUDED.registered_voters_target,public.wards.registered_voters_target),updated_at=now();
      END IF;
    ELSIF v_type='polling_centre' THEN
      IF v_ward IS NULL OR NOT EXISTS(SELECT 1 FROM public.wards WHERE id=v_ward) THEN v_unmapped:=v_unmapped+1; CONTINUE; END IF;
      IF NOT p_dry_run THEN
        INSERT INTO public.polling_centres(ward_id,name,code,total_registered_voters)
        VALUES(v_ward,v_name,NULLIF(btrim(v_row->>'code'),''),v_centre_voters)
        ON CONFLICT(ward_id,name) DO UPDATE SET code=coalesce(EXCLUDED.code,public.polling_centres.code),total_registered_voters=coalesce(EXCLUDED.total_registered_voters,public.polling_centres.total_registered_voters),updated_at=now();
      END IF;
    ELSE
      IF v_centre IS NULL OR NOT EXISTS(SELECT 1 FROM public.polling_centres WHERE id=v_centre) THEN v_unmapped:=v_unmapped+1; CONTINUE; END IF;
      SELECT ward_id INTO v_ward FROM public.polling_centres WHERE id=v_centre;
      IF NOT p_dry_run THEN
        INSERT INTO public.polling_stations(polling_centre_id,ward_id,station_name,station_number,registered_voters_est)
        VALUES(v_centre,v_ward,v_name,v_station_number,v_total_voters)
        ON CONFLICT(polling_centre_id,station_name) DO UPDATE SET station_number=EXCLUDED.station_number,registered_voters_est=coalesce(EXCLUDED.registered_voters_est,public.polling_stations.registered_voters_est),updated_at=now();
      END IF;
    END IF;
    v_imported:=v_imported+1;
  END LOOP;
  IF NOT p_dry_run THEN
    UPDATE public.imports SET total_rows=total_rows+v_count,imported_rows=imported_rows+v_imported,rejected_rows=rejected_rows+v_rejected,unmapped_rows=unmapped_rows+v_unmapped,
      summary_report=coalesce(summary_report,'{}'::jsonb)||jsonb_build_object('last_batch',jsonb_build_object('imported',v_imported,'rejected',v_rejected,'unmapped',v_unmapped))
    WHERE id=p_import_id;
    PERFORM private.audit_event('IMPORT_PLACES','imports',p_import_id::text,NULL,jsonb_build_object('imported',v_imported,'rejected',v_rejected,'unmapped',v_unmapped),'Places imported');
  END IF;
  RETURN jsonb_build_object('total',v_count,'imported',v_imported,'rejected',v_rejected,'unmapped',v_unmapped,'dry_run',p_dry_run);
END;
$$;

CREATE OR REPLACE FUNCTION public.preview_import_rows(p_kind TEXT,p_rows JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_actor public.profiles; v_row JSONB; v_index INTEGER:=0; v_result JSONB; v_rows JSONB:='[]'::jsonb; v_status TEXT; v_reason TEXT; v_one JSONB;
BEGIN
  v_actor:=private.require_roles(ARRAY['admin']::public.user_role[],true);
  IF p_kind NOT IN ('entries','network_contacts','places') OR jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows)>500 THEN
    RAISE EXCEPTION 'Preview accepts an entries, network_contacts, or places array of at most 500 rows';
  END IF;
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    IF p_kind='entries' THEN v_result:=public.import_entries_batch(gen_random_uuid(),'preview',jsonb_build_array(v_row),true);
    ELSIF p_kind='network_contacts' THEN v_result:=public.import_contacts_batch(gen_random_uuid(),'preview',jsonb_build_array(v_row),true);
    ELSE v_result:=public.import_places_batch(gen_random_uuid(),'preview',jsonb_build_array(v_row),true); END IF;
    v_status:=CASE WHEN coalesce((v_result->>'unmapped')::int,0)>0 THEN 'unmapped'
      WHEN coalesce((v_result->>'rejected')::int,0)>0 THEN 'rejected'
      WHEN coalesce((v_result->>'merged')::int,0)>0 THEN 'merged'
      WHEN coalesce((v_result->>'flagged')::int,0)>0 THEN 'flagged' ELSE 'imported' END;
    v_reason:=CASE v_status WHEN 'unmapped' THEN 'Ward, centre, or station is not mapped'
      WHEN 'rejected' THEN 'Required fields are missing or invalid'
      WHEN 'merged' THEN 'Duplicate row or ID already exists'
      WHEN 'flagged' THEN 'Database validation flags this row'
      ELSE 'Ready to import' END;
    v_rows:=v_rows||jsonb_build_array(jsonb_build_object('row_index',v_index,'status',v_status,'reason',v_reason,'flags',coalesce(v_result->'flagged',0)));
    v_index:=v_index+1;
  END LOOP;
  RETURN jsonb_build_object('rows',v_rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_import_verification_status(p_import_id UUID,p_rows JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_actor public.profiles; v_row JSONB; v_hash TEXT; v_status public.verification_status; v_old public.verification_status; v_updated INTEGER:=0;
BEGIN
  v_actor:=private.require_roles(ARRAY['admin']::public.user_role[],true);
  IF jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows)>500 THEN RAISE EXCEPTION 'Rows must be an array of at most 500'; END IF;
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    IF NULLIF(v_row->>'verification_status','') IS NULL THEN CONTINUE; END IF;
    v_status:=(v_row->>'verification_status')::public.verification_status;
    v_hash:=encode(extensions.hmac(convert_to(v_row->'row'::text,'UTF8'),convert_to(private.get_app_secret('id_hmac_secret'),'UTF8'),'sha256'),'hex');
    SELECT verification_status INTO v_old FROM public.entries WHERE import_batch_id=p_import_id AND row_hash=v_hash FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;
    UPDATE public.entries SET verification_status=v_status,updated_at=now() WHERE import_batch_id=p_import_id AND row_hash=v_hash;
    PERFORM private.audit_event('IMPORT_SET_VERIFICATION','entries',v_hash,jsonb_build_object('verification_status',v_old),jsonb_build_object('verification_status',v_status),'Legacy import sheet status');
    v_updated:=v_updated+1;
  END LOOP;
  RETURN jsonb_build_object('updated',v_updated);
END;
$$;

REVOKE ALL ON FUNCTION public.save_place_alias(public.canonical_type,TEXT,UUID,NUMERIC,TEXT) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.update_network_contact(UUID,UUID,UUID,public.reach_status,TEXT,BOOLEAN,TEXT) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.import_places_batch(UUID,TEXT,JSONB,BOOLEAN) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.preview_import_rows(TEXT,JSONB) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.set_import_verification_status(UUID,JSONB) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.save_place_alias(public.canonical_type,TEXT,UUID,NUMERIC,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_network_contact(UUID,UUID,UUID,public.reach_status,TEXT,BOOLEAN,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_places_batch(UUID,TEXT,JSONB,BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_import_rows(TEXT,JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_import_verification_status(UUID,JSONB) TO authenticated;
