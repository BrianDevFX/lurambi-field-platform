CREATE OR REPLACE FUNCTION public.admin_update_entry(p_entry_id UUID, p_changes JSONB, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor public.profiles;
  v_entry public.entries;
  v_old JSONB;
  v_new JSONB;
  v_flags TEXT[];
  v_id TEXT;
  v_hash TEXT;
  v_masked TEXT;
  v_encrypted BYTEA;
  v_phone TEXT;
BEGIN
  v_actor := private.require_roles(ARRAY['admin']::public.user_role[], true);
  IF NULLIF(btrim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Reason is required'; END IF;
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'object' THEN RAISE EXCEPTION 'Changes must be a JSON object'; END IF;
  SELECT * INTO v_entry FROM public.entries WHERE id=p_entry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Entry not found'; END IF;
  v_old := jsonb_build_object('name',v_entry.name,'phone_e164',v_entry.phone_e164,'id_masked',v_entry.id_masked,
    'ward_filed_id',v_entry.ward_filed_id,'polling_centre_id',v_entry.polling_centre_id,'polling_station_id',v_entry.polling_station_id,
    'support_level',v_entry.support_level,'issues',v_entry.issues,'notes',v_entry.notes,'flags',v_entry.flags);
  v_flags := array_remove(array_remove(array_remove(v_entry.flags,'MISSING_ID'),'INVALID_ID'),'INVALID_PHONE');
  v_phone := v_entry.phone_e164;
  IF p_changes ? 'phone' THEN
    v_phone := public.normalize_kenyan_phone(p_changes->>'phone');
    IF v_phone IS NULL THEN v_flags := array_append(v_flags,'INVALID_PHONE'); END IF;
  END IF;
  v_id := private.clean_national_id(p_changes->>'national_id');
  IF p_changes ? 'national_id' THEN
    IF v_id IS NULL THEN
      v_hash := NULL; v_masked := NULL; v_encrypted := NULL;
      v_flags := array_append(v_flags,'MISSING_ID');
    ELSE
      v_hash := private.hash_national_id(v_id);
      v_masked := private.mask_national_id(v_id);
      v_encrypted := private.encrypt_national_id(v_id);
      IF length(v_id) NOT IN (7,8) THEN v_flags := array_append(v_flags,'INVALID_ID'); END IF;
    END IF;
  ELSE
    v_hash := v_entry.id_hash; v_masked := v_entry.id_masked; v_encrypted := v_entry.id_encrypted;
  END IF;
  v_flags := ARRAY(SELECT DISTINCT f FROM unnest(v_flags) f ORDER BY f);

  UPDATE public.entries SET
    name = CASE WHEN p_changes ? 'name' THEN NULLIF(btrim(p_changes->>'name'),'') ELSE name END,
    phone_e164 = v_phone,
    id_hash = v_hash,
    id_masked = v_masked,
    id_encrypted = v_encrypted,
    ward_filed_id = CASE WHEN p_changes ? 'ward_filed_id' THEN (p_changes->>'ward_filed_id')::uuid ELSE ward_filed_id END,
    polling_centre_id = CASE WHEN p_changes ? 'polling_centre_id' THEN NULLIF(p_changes->>'polling_centre_id','')::uuid ELSE polling_centre_id END,
    polling_station_id = CASE WHEN p_changes ? 'polling_station_id' THEN NULLIF(p_changes->>'polling_station_id','')::uuid ELSE polling_station_id END,
    support_level = CASE WHEN p_changes ? 'support_level' THEN (p_changes->>'support_level')::public.support_level ELSE support_level END,
    issues = CASE WHEN p_changes ? 'issues' THEN ARRAY(SELECT jsonb_array_elements_text(p_changes->'issues')) ELSE issues END,
    needs_transport = CASE WHEN p_changes ? 'needs_transport' THEN (p_changes->>'needs_transport')::boolean ELSE needs_transport END,
    has_pvc = CASE WHEN p_changes ? 'has_pvc' THEN (p_changes->>'has_pvc')::boolean ELSE has_pvc END,
    notes = CASE WHEN p_changes ? 'notes' THEN NULLIF(p_changes->>'notes','') ELSE notes END,
    flags = v_flags,
    updated_at = now()
  WHERE id=p_entry_id;
  SELECT jsonb_build_object('name',name,'phone_e164',phone_e164,'id_masked',id_masked,'ward_filed_id',ward_filed_id,
    'polling_centre_id',polling_centre_id,'polling_station_id',polling_station_id,'support_level',support_level,
    'issues',issues,'notes',notes,'flags',flags) INTO v_new FROM public.entries WHERE id=p_entry_id;
  PERFORM private.audit_event('UPDATE_ENTRY','entries',p_entry_id::text,v_old,v_new,p_reason);
  PERFORM private.persist_entry_flags(p_entry_id,v_flags);
  RETURN jsonb_build_object('id',p_entry_id,'updated',true,'flags',v_flags);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_merge_entries(p_keep_id UUID, p_merge_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_actor public.profiles; v_keep public.entries; v_merge public.entries; v_old JSONB;
BEGIN
  v_actor := private.require_roles(ARRAY['admin']::public.user_role[], true);
  IF NULLIF(btrim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Reason is required'; END IF;
  IF p_keep_id = p_merge_id THEN RAISE EXCEPTION 'Choose two different entries'; END IF;
  SELECT * INTO v_keep FROM public.entries WHERE id=p_keep_id FOR UPDATE;
  SELECT * INTO v_merge FROM public.entries WHERE id=p_merge_id FOR UPDATE;
  IF v_keep.id IS NULL OR v_merge.id IS NULL THEN RAISE EXCEPTION 'Both entries must exist'; END IF;
  v_old := jsonb_build_object('kept',jsonb_build_object('id',v_keep.id,'name',v_keep.name,'flags',v_keep.flags),
    'merged',jsonb_build_object('id',v_merge.id,'name',v_merge.name,'flags',v_merge.flags));
  UPDATE public.entries SET
    phone_e164=coalesce(v_keep.phone_e164,v_merge.phone_e164),
    id_hash=coalesce(v_keep.id_hash,v_merge.id_hash),
    id_encrypted=coalesce(v_keep.id_encrypted,v_merge.id_encrypted),
    id_masked=coalesce(v_keep.id_masked,v_merge.id_masked),
    issues=(SELECT coalesce(array_agg(DISTINCT x),'{}') FROM unnest(v_keep.issues || v_merge.issues) x),
    flags=(SELECT coalesce(array_agg(DISTINCT x),'{}') FROM unnest(v_keep.flags || v_merge.flags) x),
    notes=concat_ws(E'\n',NULLIF(v_keep.notes,''),NULLIF(v_merge.notes,'')),
    captured_on=least(v_keep.captured_on,v_merge.captured_on),
    updated_at=now()
  WHERE id=p_keep_id;
  DELETE FROM public.entries WHERE id=p_merge_id;
  PERFORM private.audit_event('MERGE_ENTRIES','entries',p_keep_id::text,v_old,
    jsonb_build_object('kept_entry_id',p_keep_id,'merged_entry_id',p_merge_id),p_reason);
  RETURN jsonb_build_object('kept_entry_id',p_keep_id,'merged_entry_id',p_merge_id,'merged',true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reassign_entry(p_entry_id UUID, p_mobilizer_id UUID, p_ward_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_actor public.profiles; v_entry public.entries; v_target public.profiles; v_old JSONB;
BEGIN
  v_actor := private.require_roles(ARRAY['admin']::public.user_role[], true);
  IF NULLIF(btrim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Reason is required'; END IF;
  SELECT * INTO v_entry FROM public.entries WHERE id=p_entry_id FOR UPDATE;
  SELECT * INTO v_target FROM public.profiles WHERE id=p_mobilizer_id;
  IF v_entry.id IS NULL OR v_target.id IS NULL OR v_target.role <> 'mobilizer' OR v_target.status <> 'approved' THEN
    RAISE EXCEPTION 'Entry and approved target mobilizer are required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.wards WHERE id=p_ward_id) THEN RAISE EXCEPTION 'Ward not found'; END IF;
  v_old := jsonb_build_object('mobilizer_id',v_entry.mobilizer_id,'ward_filed_id',v_entry.ward_filed_id);
  UPDATE public.entries SET mobilizer_id=p_mobilizer_id, ward_filed_id=p_ward_id, updated_at=now() WHERE id=p_entry_id;
  PERFORM private.audit_event('REASSIGN_ENTRY','entries',p_entry_id::text,v_old,
    jsonb_build_object('mobilizer_id',p_mobilizer_id,'ward_filed_id',p_ward_id),p_reason);
  RETURN jsonb_build_object('id',p_entry_id,'mobilizer_id',p_mobilizer_id,'ward_filed_id',p_ward_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_flag(p_flag_id UUID, p_action TEXT, p_reason TEXT, p_merge_into UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_actor public.profiles; v_flag public.flag_events;
BEGIN
  v_actor := private.require_roles(ARRAY['admin']::public.user_role[], true);
  IF p_action NOT IN ('resolve','dismiss','merge') OR NULLIF(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Valid action and reason are required'; END IF;
  SELECT * INTO v_flag FROM public.flag_events WHERE id=p_flag_id FOR UPDATE;
  IF v_flag.id IS NULL THEN RAISE EXCEPTION 'Flag not found'; END IF;
  IF p_action='merge' THEN
    IF p_merge_into IS NULL THEN RAISE EXCEPTION 'A target entry is required for merge'; END IF;
    PERFORM public.admin_merge_entries(p_merge_into,v_flag.entry_id,p_reason);
  ELSE
    UPDATE public.flag_events SET is_resolved=true,resolved_by=v_actor.id,resolved_at=now(),resolution_notes=p_reason WHERE id=p_flag_id;
  END IF;
  PERFORM private.audit_event('FLAG_'||upper(p_action),'flag_events',p_flag_id::text,
    jsonb_build_object('is_resolved',v_flag.is_resolved,'flag_code',v_flag.flag_code),
    jsonb_build_object('action',p_action,'entry_id',v_flag.entry_id),p_reason);
  RETURN jsonb_build_object('flag_id',p_flag_id,'action',p_action,'resolved',true);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_verification(p_entry_id UUID, p_status public.verification_status, p_evidence_note TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_actor public.profiles; v_old JSONB;
BEGIN
  v_actor := private.require_roles(ARRAY['admin']::public.user_role[], true);
  IF NULLIF(btrim(p_evidence_note),'') IS NULL THEN RAISE EXCEPTION 'Evidence note is required'; END IF;
  SELECT jsonb_build_object('verification_status',verification_status,'verification_notes',verification_notes) INTO v_old
  FROM public.entries WHERE id=p_entry_id FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Entry not found'; END IF;
  UPDATE public.entries SET verification_status=p_status, verification_notes=p_evidence_note,
    verified_by=v_actor.id, verified_at=now(), updated_at=now() WHERE id=p_entry_id;
  PERFORM private.audit_event('SET_VERIFICATION','entries',p_entry_id::text,v_old,
    jsonb_build_object('verification_status',p_status,'verification_notes',p_evidence_note),p_evidence_note);
  RETURN jsonb_build_object('id',p_entry_id,'verification_status',p_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.bulk_set_verification(p_rows JSONB, p_evidence_note TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_actor public.profiles; v_row JSONB; v_count INTEGER := 0; v_status public.verification_status;
BEGIN
  v_actor := private.require_roles(ARRAY['admin']::public.user_role[], true);
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 500 THEN RAISE EXCEPTION 'Rows must be an array of at most 500 items'; END IF;
  IF NULLIF(btrim(p_evidence_note),'') IS NULL THEN RAISE EXCEPTION 'Evidence note is required'; END IF;
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v_status := (v_row->>'status')::public.verification_status;
    PERFORM public.set_verification((v_row->>'entry_id')::uuid,v_status,p_evidence_note);
    v_count := v_count + 1;
  END LOOP;
  RETURN jsonb_build_object('updated',v_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.reveal_id(p_entry_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_actor public.profiles; v_cipher BYTEA; v_id TEXT;
BEGIN
  v_actor := private.require_roles(ARRAY['admin']::public.user_role[], true);
  IF NULLIF(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Reason is required'; END IF;
  SELECT id_encrypted INTO v_cipher FROM public.entries WHERE id=p_entry_id;
  IF NOT FOUND OR v_cipher IS NULL THEN RAISE EXCEPTION 'Encrypted ID not available'; END IF;
  v_id := extensions.pgp_sym_decrypt(v_cipher,private.get_app_secret('id_encryption_key'));
  PERFORM private.audit_event('REVEAL_ID','entries',p_entry_id::text,NULL,
    jsonb_build_object('revealed',true),p_reason);
  RETURN jsonb_build_object('entry_id',p_entry_id,'national_id',v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.log_export(p_export_type TEXT, p_format TEXT, p_filters JSONB, p_row_count INTEGER, p_file_name TEXT, p_ip_address TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_actor public.profiles; v_id UUID := gen_random_uuid(); v_ip_hash TEXT;
BEGIN
  v_actor := private.require_roles(ARRAY['admin','ward_coordinator','mobilizer']::public.user_role[], true);
  IF p_format NOT IN ('xlsx','csv','pdf') OR p_row_count < 0 OR NULLIF(btrim(p_file_name),'') IS NULL THEN
    RAISE EXCEPTION 'Invalid export metadata';
  END IF;
  IF p_ip_address IS NOT NULL THEN v_ip_hash := encode(extensions.digest(convert_to(p_ip_address,'UTF8'),'sha256'),'hex'); END IF;
  INSERT INTO public.exports_log(id,user_id,export_type,format,filter_criteria,row_count,file_name,ip_address_hash)
  VALUES (v_id,v_actor.id,p_export_type,p_format,coalesce(p_filters,'{}'::jsonb),p_row_count,p_file_name,v_ip_hash);
  PERFORM private.audit_event('EXPORT','exports_log',v_id::text,NULL,
    jsonb_build_object('export_type',p_export_type,'format',p_format,'row_count',p_row_count),'Export generated');
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.import_entries_batch(p_import_id UUID, p_file_name TEXT, p_rows JSONB, p_dry_run BOOLEAN DEFAULT false)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor public.profiles;
  v_row JSONB;
  v_count INTEGER;
  v_imported INTEGER := 0;
  v_merged INTEGER := 0;
  v_rejected INTEGER := 0;
  v_flagged INTEGER := 0;
  v_unmapped INTEGER := 0;
  v_name TEXT; v_phone TEXT; v_id TEXT; v_hash TEXT;
  v_ward_id UUID; v_centre_id UUID; v_station_id UUID; v_alias RECORD;
  v_captured TIMESTAMPTZ; v_support public.support_level; v_label TEXT; v_alias_confidence NUMERIC;
  v_result JSONB; v_client_request UUID; v_flags TEXT[]; v_id_hash TEXT;
  v_existing_id UUID; v_existing_capture TIMESTAMPTZ;
BEGIN
  v_actor := private.require_roles(ARRAY['admin']::public.user_role[], true);
  IF p_import_id IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN RAISE EXCEPTION 'Import ID and rows array are required'; END IF;
  v_count := jsonb_array_length(p_rows);
  IF v_count > 500 THEN RAISE EXCEPTION 'A batch may contain at most 500 rows'; END IF;
  IF NOT p_dry_run THEN
    INSERT INTO public.imports(id,file_name,import_type,created_by)
    VALUES (p_import_id,coalesce(NULLIF(btrim(p_file_name),''),'legacy-import.xlsx'),'entries',v_actor.id)
    ON CONFLICT (id) DO NOTHING;
    IF NOT EXISTS (SELECT 1 FROM public.imports WHERE id=p_import_id AND import_type='entries') THEN RAISE EXCEPTION 'Import ID belongs to another import'; END IF;
  END IF;
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v_alias_confidence := NULL;
    v_name := NULLIF(btrim(coalesce(v_row->>'name',v_row->>'full_name')),'');
    IF v_name IS NULL OR length(v_name) < 2 OR length(v_name) > 160 THEN v_rejected := v_rejected + 1; CONTINUE; END IF;
    v_phone := public.normalize_kenyan_phone(coalesce(v_row->>'phone',v_row->>'phone_e164'));
    v_id := private.clean_national_id(coalesce(v_row->>'national_id',v_row->>'id_no'));
    v_id_hash := private.hash_national_id(v_id);
    v_ward_id := NULL; v_centre_id := NULL; v_station_id := NULL;
    BEGIN v_ward_id := NULLIF(v_row->>'ward_id','')::uuid; EXCEPTION WHEN invalid_text_representation THEN v_ward_id := NULL; END;
    IF v_ward_id IS NULL THEN
      SELECT id INTO v_ward_id FROM public.wards WHERE lower(btrim(name))=lower(btrim(coalesce(v_row->>'ward_name',v_row->>'ward'))) LIMIT 1;
    END IF;
    IF v_ward_id IS NULL THEN
      SELECT * INTO v_alias FROM private.resolve_place_alias('ward',coalesce(v_row->>'ward_name',v_row->>'ward'));
      v_ward_id := v_alias.ward_id;
      v_alias_confidence := v_alias.confidence;
    END IF;
    IF v_ward_id IS NULL THEN v_unmapped := v_unmapped + 1; CONTINUE; END IF;
    BEGIN v_centre_id := NULLIF(v_row->>'polling_centre_id','')::uuid; EXCEPTION WHEN invalid_text_representation THEN v_centre_id := NULL; END;
    IF v_centre_id IS NULL THEN
      SELECT id INTO v_centre_id FROM public.polling_centres WHERE ward_id=v_ward_id AND lower(btrim(name))=lower(btrim(coalesce(v_row->>'polling_centre_name',v_row->>'polling_centre',v_row->>'polling_place'))) LIMIT 1;
    END IF;
    IF v_centre_id IS NULL THEN
      SELECT * INTO v_alias FROM private.resolve_place_alias('polling_centre',coalesce(v_row->>'polling_centre_name',v_row->>'polling_centre',v_row->>'polling_place'));
      v_centre_id := v_alias.centre_id;
      v_alias_confidence := least(coalesce(v_alias_confidence, 1), v_alias.confidence);
    END IF;
    BEGIN v_station_id := NULLIF(v_row->>'polling_station_id','')::uuid; EXCEPTION WHEN invalid_text_representation THEN v_station_id := NULL; END;
    IF v_station_id IS NULL THEN
      SELECT id INTO v_station_id FROM public.polling_stations WHERE polling_centre_id=v_centre_id AND lower(btrim(station_name))=lower(btrim(coalesce(v_row->>'polling_station_name',v_row->>'polling_station'))) LIMIT 1;
    END IF;
    IF v_station_id IS NULL AND NULLIF(btrim(coalesce(v_row->>'polling_station_name',v_row->>'polling_station')),'') IS NOT NULL THEN
      SELECT * INTO v_alias FROM private.resolve_place_alias('polling_station',coalesce(v_row->>'polling_station_name',v_row->>'polling_station'));
      v_station_id := v_alias.station_id;
      v_alias_confidence := least(coalesce(v_alias_confidence, 1), v_alias.confidence);
    END IF;
    IF v_centre_id IS NULL OR (NULLIF(btrim(coalesce(v_row->>'polling_station_name',v_row->>'polling_station')),'') IS NOT NULL AND v_station_id IS NULL) THEN
      v_unmapped := v_unmapped + 1; CONTINUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.polling_centres WHERE id=v_centre_id AND ward_id=v_ward_id)
       OR (v_station_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.polling_stations WHERE id=v_station_id AND polling_centre_id=v_centre_id)) THEN
      v_unmapped := v_unmapped + 1; CONTINUE;
    END IF;
    v_support := 'not_assessed'; v_label := NULL;
    IF lower(coalesce(v_row->>'support_level','')) IN ('strong supporter','strong_supporter','strong') THEN v_support := 'strong_supporter';
    ELSIF lower(coalesce(v_row->>'support_level','')) IN ('leaning','lean') THEN v_support := 'leaning';
    ELSIF lower(coalesce(v_row->>'support_level','')) IN ('undecided','neutral') THEN v_support := 'undecided';
    ELSIF lower(coalesce(v_row->>'support_level','')) = 'opposed' THEN v_support := 'opposed';
    ELSIF lower(coalesce(v_row->>'support_level','')) IN ('not reached','not_reached') THEN v_support := 'not_reached';
    ELSIF lower(coalesce(v_row->>'support_level','')) IN ('not assessed','not_assessed','') THEN v_support := 'not_assessed';
    ELSE v_label := NULLIF(btrim(v_row->>'support_level'),''); END IF;
    BEGIN v_captured := coalesce(NULLIF(v_row->>'captured_on','')::timestamptz,NULLIF(v_row->>'date','')::timestamptz,now());
    EXCEPTION WHEN others THEN v_captured := now(); END;
    v_hash := encode(extensions.hmac(convert_to(v_row::text,'UTF8'),convert_to(private.get_app_secret('id_hmac_secret'),'UTF8'),'sha256'),'hex');
    v_client_request := md5(v_hash)::uuid;
    IF v_hash IS NOT NULL THEN
      SELECT id,captured_on INTO v_existing_id,v_existing_capture
      FROM public.entries WHERE row_hash=v_hash LIMIT 1;
      IF FOUND THEN
        IF NOT p_dry_run THEN
          UPDATE public.entries SET captured_on=least(captured_on,v_captured),updated_at=now() WHERE id=v_existing_id;
        END IF;
        v_merged := v_merged + 1;
        CONTINUE;
      END IF;
    END IF;
    IF v_id_hash IS NOT NULL THEN
      SELECT id,captured_on INTO v_existing_id,v_existing_capture FROM public.entries WHERE id_hash=v_id_hash LIMIT 1;
      IF FOUND THEN
        IF NOT p_dry_run THEN UPDATE public.entries SET captured_on=least(captured_on,v_captured),updated_at=now() WHERE id=v_existing_id; END IF;
        v_merged := v_merged + 1; CONTINUE;
      END IF;
    END IF;
    v_flags := ARRAY[]::TEXT[];
    IF v_id IS NULL THEN v_flags := array_append(v_flags,'MISSING_ID');
    ELSIF length(v_id) NOT IN (7,8) THEN v_flags := array_append(v_flags,'INVALID_ID'); END IF;
    IF v_phone IS NULL THEN v_flags := array_append(v_flags,'INVALID_PHONE'); END IF;
    IF v_alias_confidence IS NOT NULL AND v_alias_confidence < 0.85 THEN v_flags := array_append(v_flags,'LOW_CONFIDENCE_MATCH'); END IF;
    IF coalesce(v_row->>'polling_centre_name',v_row->>'polling_centre',v_row->>'polling_place') IS NOT NULL AND v_centre_id IS NULL THEN v_flags := array_append(v_flags,'UNMAPPED_PLACE'); END IF;
    IF p_dry_run THEN
      v_imported := v_imported + 1;
      IF cardinality(v_flags)>0 THEN v_flagged := v_flagged + 1; END IF;
      CONTINUE;
    END IF;
    v_result := private.insert_entry_core(v_client_request, '00000000-0000-4000-8000-000000000001', v_name,
      coalesce(v_row->>'phone',v_row->>'phone_e164'), v_row->>'national_id', v_ward_id, v_centre_id, v_station_id,
      coalesce(v_row->>'polling_centre_name',v_row->>'polling_centre',v_row->>'polling_place'),
      coalesce(v_row->>'polling_station_name',v_row->>'polling_station'), v_support,
      ARRAY(SELECT jsonb_array_elements_text(coalesce(v_row->'issues','[]'::jsonb))),
      coalesce((v_row->>'needs_transport')::boolean,false), coalesce((v_row->>'has_pvc')::boolean,false),
      v_row->>'notes', false, NULL, 'legacy', v_captured, v_label, p_import_id, v_hash);
    IF coalesce((v_result->>'blocked')::boolean,false) THEN
      UPDATE public.entries SET captured_on=least(captured_on,v_captured),updated_at=now()
      WHERE id=NULLIF(v_result->'matched'->>'id','')::uuid;
      v_merged := v_merged + 1;
    ELSE
      v_imported := v_imported + 1;
      IF jsonb_array_length(coalesce(v_result->'flags','[]'::jsonb)) > 0 THEN v_flagged := v_flagged + 1; END IF;
    END IF;
  END LOOP;
  IF NOT p_dry_run THEN
    UPDATE public.imports SET total_rows=total_rows+v_count, imported_rows=imported_rows+v_imported,
      duplicate_rows=duplicate_rows+v_merged,rejected_rows=rejected_rows+v_rejected,
      flagged_rows=flagged_rows+v_flagged,unmapped_rows=unmapped_rows+v_unmapped,
      summary_report=coalesce(summary_report,'{}'::jsonb) || jsonb_build_object('last_batch',jsonb_build_object(
        'imported',v_imported,'merged',v_merged,'rejected',v_rejected,'flagged',v_flagged,'unmapped',v_unmapped)),
      created_by=coalesce(created_by,v_actor.id)
    WHERE id=p_import_id;
  END IF;
  RETURN jsonb_build_object('total',v_count,'imported',v_imported,'merged',v_merged,'rejected',v_rejected,'flagged',v_flagged,'unmapped',v_unmapped,'dry_run',p_dry_run);
END;
$$;

CREATE OR REPLACE FUNCTION public.import_contacts_batch(p_import_id UUID, p_file_name TEXT, p_rows JSONB, p_dry_run BOOLEAN DEFAULT false)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_actor public.profiles; v_row JSONB; v_count INTEGER; v_imported INTEGER:=0; v_merged INTEGER:=0; v_rejected INTEGER:=0; v_unmapped INTEGER:=0;
        v_type public.network_contact_type; v_ward UUID; v_station UUID; v_phone TEXT; v_id TEXT; v_hash TEXT;
BEGIN
  v_actor := private.require_roles(ARRAY['admin']::public.user_role[], true);
  IF p_import_id IS NULL OR jsonb_typeof(p_rows)<>'array' THEN RAISE EXCEPTION 'Import ID and rows array are required'; END IF;
  v_count := jsonb_array_length(p_rows);
  IF v_count>500 THEN RAISE EXCEPTION 'A batch may contain at most 500 rows'; END IF;
  IF NOT p_dry_run THEN
    INSERT INTO public.imports(id,file_name,import_type,created_by)
    VALUES (p_import_id,coalesce(NULLIF(btrim(p_file_name),''),'network-contacts.xlsx'),'network_contacts',v_actor.id)
    ON CONFLICT(id) DO NOTHING;
    IF NOT EXISTS (SELECT 1 FROM public.imports WHERE id=p_import_id AND import_type='network_contacts') THEN RAISE EXCEPTION 'Import ID belongs to another import'; END IF;
  END IF;
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    BEGIN v_type := lower(coalesce(v_row->>'type','other'))::public.network_contact_type;
    EXCEPTION WHEN invalid_text_representation THEN v_rejected:=v_rejected+1; CONTINUE; END;
    IF NULLIF(btrim(v_row->>'name'),'') IS NULL THEN v_rejected:=v_rejected+1; CONTINUE; END IF;
    v_ward := NULL;
    BEGIN v_ward := NULLIF(v_row->>'ward_id','')::uuid; EXCEPTION WHEN invalid_text_representation THEN v_ward:=NULL; END;
    IF v_ward IS NULL THEN SELECT id INTO v_ward FROM public.wards WHERE lower(btrim(name))=lower(btrim(v_row->>'ward')) LIMIT 1; END IF;
    IF v_ward IS NULL AND NULLIF(btrim(v_row->>'ward'),'') IS NOT NULL THEN
      SELECT ward_id INTO v_ward FROM private.resolve_place_alias('ward',v_row->>'ward') LIMIT 1;
    END IF;
    IF NULLIF(btrim(v_row->>'ward'),'') IS NOT NULL AND v_ward IS NULL THEN v_unmapped:=v_unmapped+1; CONTINUE; END IF;
    v_station:=NULL;
    BEGIN v_station:=NULLIF(v_row->>'polling_station_id','')::uuid; EXCEPTION WHEN invalid_text_representation THEN v_station:=NULL; END;
    v_phone:=public.normalize_kenyan_phone(v_row->>'phone');
    v_id:=private.clean_national_id(v_row->>'national_id');
    v_hash:=encode(extensions.hmac(convert_to(v_row::text,'UTF8'),convert_to(private.get_app_secret('id_hmac_secret'),'UTF8'),'sha256'),'hex');
    IF EXISTS (SELECT 1 FROM public.network_contacts WHERE row_hash=v_hash) THEN v_merged:=v_merged+1; CONTINUE; END IF;
    IF NOT p_dry_run THEN
      INSERT INTO public.network_contacts(type,name,phone_e164,national_id_hash,national_id_encrypted,denomination,community_unit,sub_county,ward_id,polling_station_id,reach_status,notes,exclude_from_campaign_exports,import_batch_id,row_hash)
      VALUES (v_type,btrim(v_row->>'name'),v_phone,private.hash_national_id(v_id),private.encrypt_national_id(v_id),
        NULLIF(v_row->>'denomination',''),NULLIF(v_row->>'community_unit',''),coalesce(NULLIF(v_row->>'sub_county',''),'Lurambi'),v_ward,v_station,
        coalesce(NULLIF(v_row->>'reach_status','')::public.reach_status,'not_contacted'),NULLIF(v_row->>'notes',''),
        CASE WHEN v_type='chp' THEN coalesce((v_row->>'exclude_from_campaign_exports')::boolean,true) ELSE coalesce((v_row->>'exclude_from_campaign_exports')::boolean,false) END,p_import_id,v_hash);
    END IF;
    v_imported:=v_imported+1;
  END LOOP;
  IF NOT p_dry_run THEN
    UPDATE public.imports SET total_rows=total_rows+v_count,imported_rows=imported_rows+v_imported,duplicate_rows=duplicate_rows+v_merged,rejected_rows=rejected_rows+v_rejected,unmapped_rows=unmapped_rows+v_unmapped,
      summary_report=coalesce(summary_report,'{}'::jsonb)||jsonb_build_object('last_batch',jsonb_build_object('imported',v_imported,'merged',v_merged,'rejected',v_rejected,'unmapped',v_unmapped))
    WHERE id=p_import_id;
  END IF;
  RETURN jsonb_build_object('total',v_count,'imported',v_imported,'merged',v_merged,'rejected',v_rejected,'unmapped',v_unmapped,'dry_run',p_dry_run);
END;
$$;

CREATE OR REPLACE FUNCTION public.public_join(
  p_client_request_id UUID, p_referral_code TEXT, p_name TEXT, p_phone TEXT, p_national_id TEXT,
  p_ward_filed_id UUID, p_polling_centre_id UUID, p_polling_station_id UUID,
  p_polling_centre_label TEXT, p_polling_station_label TEXT, p_support_level public.support_level,
  p_consent BOOLEAN, p_consent_text_version TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_referrer public.profiles; v_result JSONB;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service_role only' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_referrer FROM public.profiles WHERE referral_code=upper(btrim(p_referral_code)) AND role='mobilizer' AND status='approved';
  IF NOT FOUND THEN RAISE EXCEPTION 'Join is unavailable'; END IF;
  v_result := private.insert_entry_core(p_client_request_id,v_referrer.id,p_name,p_phone,p_national_id,p_ward_filed_id,
    p_polling_centre_id,p_polling_station_id,p_polling_centre_label,p_polling_station_label,p_support_level,
    ARRAY[]::TEXT[],false,false,NULL,p_consent,p_consent_text_version,'self_registered',now(),NULL,NULL,NULL);
  IF coalesce((v_result->>'blocked')::boolean,false) THEN RETURN jsonb_build_object('accepted',true); END IF;
  RETURN jsonb_build_object('accepted',true,'entry_id',v_result->>'id','flags',v_result->'flags');
END;
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_ward_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_entry(UUID,TEXT,TEXT,TEXT,UUID,UUID,UUID,TEXT,TEXT,public.support_level,TEXT[],BOOLEAN,BOOLEAN,TEXT,BOOLEAN,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_entries(TEXT,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_mobilizer(UUID,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.suspend_mobilizer(UUID,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_entry(UUID,JSONB,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_merge_entries(UUID,UUID,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reassign_entry(UUID,UUID,UUID,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_flag(UUID,TEXT,TEXT,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_verification(UUID,public.verification_status,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_set_verification(JSONB,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reveal_id(UUID,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_export(TEXT,TEXT,JSONB,INTEGER,TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_entries_batch(UUID,TEXT,JSONB,BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_contacts_batch(UUID,TEXT,JSONB,BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.public_join(UUID,TEXT,TEXT,TEXT,TEXT,UUID,UUID,UUID,TEXT,TEXT,public.support_level,BOOLEAN,TEXT) TO service_role;
