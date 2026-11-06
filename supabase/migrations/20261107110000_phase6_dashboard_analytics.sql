CREATE OR REPLACE FUNCTION public.dashboard_metrics(p_filters JSONB DEFAULT '{}'::jsonb)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor public.profiles;
  v_ward_id UUID;
  v_centre_id UUID;
  v_station_id UUID;
  v_mobilizer_id UUID;
  v_date_from DATE;
  v_date_to DATE;
  v_support public.support_level;
  v_verification public.verification_status;
  v_source TEXT;
  v_result JSONB;
BEGIN
  v_actor := private.require_roles(ARRAY['admin','ward_coordinator','mobilizer']::public.user_role[], true);

  IF coalesce(p_filters, '{}'::jsonb) ? 'ward_id' AND NULLIF(p_filters->>'ward_id','') IS NOT NULL THEN
    v_ward_id := (p_filters->>'ward_id')::UUID;
  END IF;
  IF coalesce(p_filters, '{}'::jsonb) ? 'centre_id' AND NULLIF(p_filters->>'centre_id','') IS NOT NULL THEN
    v_centre_id := (p_filters->>'centre_id')::UUID;
  END IF;
  IF coalesce(p_filters, '{}'::jsonb) ? 'station_id' AND NULLIF(p_filters->>'station_id','') IS NOT NULL THEN
    v_station_id := (p_filters->>'station_id')::UUID;
  END IF;
  IF coalesce(p_filters, '{}'::jsonb) ? 'mobilizer_id' AND NULLIF(p_filters->>'mobilizer_id','') IS NOT NULL THEN
    v_mobilizer_id := (p_filters->>'mobilizer_id')::UUID;
  END IF;
  IF coalesce(p_filters, '{}'::jsonb) ? 'date_from' AND NULLIF(p_filters->>'date_from','') IS NOT NULL THEN
    v_date_from := (p_filters->>'date_from')::DATE;
  END IF;
  IF coalesce(p_filters, '{}'::jsonb) ? 'date_to' AND NULLIF(p_filters->>'date_to','') IS NOT NULL THEN
    v_date_to := (p_filters->>'date_to')::DATE;
  END IF;
  IF coalesce(p_filters, '{}'::jsonb) ? 'support_level' AND NULLIF(p_filters->>'support_level','') IS NOT NULL THEN
    v_support := (p_filters->>'support_level')::public.support_level;
  END IF;
  IF coalesce(p_filters, '{}'::jsonb) ? 'verification_status' AND NULLIF(p_filters->>'verification_status','') IS NOT NULL THEN
    v_verification := (p_filters->>'verification_status')::public.verification_status;
  END IF;
  v_source := NULLIF(p_filters->>'source','');
  IF v_source IS NOT NULL AND v_source NOT IN ('legacy','mobilizer','self_registered') THEN
    RAISE EXCEPTION 'Invalid dashboard source filter';
  END IF;
  IF v_date_from IS NOT NULL AND v_date_to IS NOT NULL AND v_date_from > v_date_to THEN
    RAISE EXCEPTION 'Start date must not be after end date';
  END IF;

  IF v_actor.role = 'mobilizer' THEN
    IF v_mobilizer_id IS NOT NULL AND v_mobilizer_id <> v_actor.id THEN
      RAISE EXCEPTION 'Mobilizers may view only their own statistics' USING ERRCODE='42501';
    END IF;
    v_mobilizer_id := v_actor.id;
  ELSIF v_actor.role = 'ward_coordinator' THEN
    IF v_actor.home_ward_id IS NULL THEN RAISE EXCEPTION 'Coordinator ward is not configured' USING ERRCODE='42501'; END IF;
    IF v_ward_id IS NOT NULL AND v_ward_id <> v_actor.home_ward_id THEN
      RAISE EXCEPTION 'Coordinator may view only their own ward' USING ERRCODE='42501';
    END IF;
    v_ward_id := v_actor.home_ward_id;
  END IF;

  WITH filtered_entries AS MATERIALIZED (
    SELECT e.*,
      EXISTS (SELECT 1 FROM public.voter_register active_voter WHERE active_voter.id=e.register_voter_id AND active_voter.is_active) AS has_active_register_match
    FROM public.entries e
    WHERE (v_ward_id IS NULL OR e.ward_filed_id = v_ward_id)
      AND (v_centre_id IS NULL OR e.polling_centre_id = v_centre_id)
      AND (v_station_id IS NULL OR e.polling_station_id = v_station_id)
      AND (v_mobilizer_id IS NULL OR e.mobilizer_id = v_mobilizer_id)
      AND (v_date_from IS NULL OR e.captured_on >= v_date_from::timestamptz)
      AND (v_date_to IS NULL OR e.captured_on < (v_date_to + 1)::timestamptz)
      AND (v_support IS NULL OR e.support_level = v_support)
      AND (v_verification IS NULL OR e.verification_status = v_verification)
      AND (v_source IS NULL OR e.source::text = v_source)
      AND (v_actor.role <> 'ward_coordinator' OR e.ward_filed_id = v_actor.home_ward_id)
      AND (v_actor.role <> 'mobilizer' OR e.mobilizer_id = v_actor.id)
  ),
  totals AS (
    SELECT count(*)::INTEGER AS entry_count,
      count(*) FILTER (WHERE id_hash IS NOT NULL)::INTEGER AS valid_id_count,
      count(*) FILTER (WHERE phone_e164 IS NOT NULL)::INTEGER AS valid_phone_count,
      count(*) FILTER (WHERE polling_centre_id IS NOT NULL AND polling_station_id IS NOT NULL AND NOT ('UNMAPPED_PLACE'=ANY(flags)))::INTEGER AS mapped_place_count,
      count(*) FILTER (WHERE support_level <> 'not_assessed')::INTEGER AS assessed_support_count,
      count(*) FILTER (WHERE verification_status='verified')::INTEGER AS verified_count,
      count(DISTINCT register_voter_id) FILTER (WHERE has_active_register_match)::INTEGER AS matched_register_count
    FROM filtered_entries
  ),
  ward_register AS (
    SELECT vr.ward_id, count(*)::INTEGER AS register_count
    FROM public.voter_register vr
    WHERE v_actor.role IN ('admin','ward_coordinator') AND vr.is_active AND vr.ward_id IS NOT NULL
      AND (v_ward_id IS NULL OR vr.ward_id=v_ward_id)
      AND (v_centre_id IS NULL OR vr.polling_centre_id=v_centre_id)
      AND (v_station_id IS NULL OR vr.polling_station_id=v_station_id)
      AND (v_actor.role <> 'ward_coordinator' OR vr.ward_id=v_actor.home_ward_id)
    GROUP BY vr.ward_id
  ),
  ward_totals AS (
    SELECT w.id AS ward_id,w.name AS ward_name,count(DISTINCT fe.id)::INTEGER AS entries,
      coalesce(wr.register_count,0)::INTEGER AS register_size,
      count(DISTINCT fe.register_voter_id) FILTER (WHERE fe.has_active_register_match)::INTEGER AS matched_registered,
      CASE WHEN coalesce(wr.register_count,0)>0 THEN round(100.0*count(DISTINCT fe.register_voter_id) FILTER (WHERE fe.has_active_register_match)/wr.register_count,1) ELSE NULL END AS coverage_pct
    FROM public.wards w
    LEFT JOIN filtered_entries fe ON fe.ward_filed_id=w.id
    LEFT JOIN ward_register wr ON wr.ward_id=w.id
    WHERE (v_ward_id IS NULL OR w.id=v_ward_id)
      AND (v_actor.role <> 'ward_coordinator' OR w.id=v_actor.home_ward_id)
    GROUP BY w.id,w.name,wr.register_count
  ),
  station_totals AS (
    SELECT ps.id AS station_id,ps.station_name AS station,pc.id AS centre_id,pc.name AS centre,
      w.id AS ward_id,w.name AS ward,count(DISTINCT fe.id)::INTEGER AS entries,
      count(DISTINCT vr.id)::INTEGER AS register_size,
      count(DISTINCT fe.register_voter_id) FILTER (WHERE fe.has_active_register_match)::INTEGER AS matched_registered,
      CASE WHEN count(DISTINCT vr.id)>0 THEN round(100.0*count(DISTINCT fe.register_voter_id) FILTER (WHERE fe.has_active_register_match)/count(DISTINCT vr.id),1) ELSE NULL END AS coverage_pct
    FROM public.polling_stations ps
    JOIN public.polling_centres pc ON pc.id=ps.polling_centre_id
    JOIN public.wards w ON w.id=ps.ward_id
    LEFT JOIN filtered_entries fe ON fe.polling_station_id=ps.id
    LEFT JOIN public.voter_register vr ON vr.polling_station_id=ps.id AND vr.is_active AND v_actor.role IN ('admin','ward_coordinator')
    WHERE (v_ward_id IS NULL OR w.id=v_ward_id)
      AND (v_centre_id IS NULL OR pc.id=v_centre_id)
      AND (v_station_id IS NULL OR ps.id=v_station_id)
      AND (v_actor.role <> 'ward_coordinator' OR w.id=v_actor.home_ward_id)
    GROUP BY ps.id,ps.station_name,pc.id,pc.name,w.id,w.name
  ),
  support_breakdown AS (
    SELECT s.level,count(fe.id)::INTEGER AS entries
    FROM unnest(enum_range(NULL::public.support_level)) AS s(level)
    LEFT JOIN filtered_entries fe ON fe.support_level=s.level
    GROUP BY s.level
  ),
  ward_support AS (
    SELECT w.id AS ward_id,w.name AS ward_name,s.level AS support_level,count(fe.id)::INTEGER AS entries
    FROM public.wards w
    CROSS JOIN unnest(enum_range(NULL::public.support_level)) AS s(level)
    LEFT JOIN filtered_entries fe ON fe.ward_filed_id=w.id AND fe.support_level=s.level
    WHERE (v_ward_id IS NULL OR w.id=v_ward_id)
      AND (v_actor.role <> 'ward_coordinator' OR w.id=v_actor.home_ward_id)
    GROUP BY w.id,w.name,s.level
  ),
  verification_funnel AS (
    SELECT s.status,count(fe.id)::INTEGER AS entries
    FROM unnest(enum_range(NULL::public.verification_status)) AS s(status)
    LEFT JOIN filtered_entries fe ON fe.verification_status=s.status
    GROUP BY s.status
  ),
  issue_ranked AS (
    SELECT fe.ward_filed_id AS ward_id,w.name AS ward_name,issue AS issue,count(*)::INTEGER AS entries,
      row_number() OVER (PARTITION BY fe.ward_filed_id ORDER BY count(*) DESC,issue) AS rank
    FROM filtered_entries fe
    JOIN public.wards w ON w.id=fe.ward_filed_id
    CROSS JOIN LATERAL unnest(fe.issues) AS u(issue)
    GROUP BY fe.ward_filed_id,w.name,issue
  ),
  issue_totals AS (SELECT ward_id,ward_name,issue,entries FROM issue_ranked WHERE rank<=5),
  mobilizer_quality AS (
    SELECT p.id AS mobilizer_id,p.full_name AS mobilizer,
      count(fe.id)::INTEGER AS entries,
      count(fe.id) FILTER (WHERE cardinality(array_remove(coalesce(fe.flags,'{}'::text[]),'SHARED_PHONE'))=0)::INTEGER AS valid_entries,
      count(fe.id) FILTER (WHERE cardinality(array_remove(coalesce(fe.flags,'{}'::text[]),'SHARED_PHONE'))>0)::INTEGER AS flagged_entries,
      CASE WHEN count(fe.id)>0 THEN round(100.0*count(fe.id) FILTER (WHERE cardinality(array_remove(coalesce(fe.flags,'{}'::text[]),'SHARED_PHONE'))>0)/count(fe.id),1) ELSE 0 END AS flag_rate_pct,
      count(DISTINCT fe.id) FILTER (WHERE fe.id_hash IS NOT NULL)::INTEGER AS entries_with_id,
      CASE WHEN count(fe.id)>0 THEN round(100.0*count(fe.id) FILTER (WHERE fe.id_hash IS NOT NULL)/count(fe.id),1) ELSE 0 END AS id_capture_rate_pct,
      count(DISTINCT da.id)::INTEGER AS duplicate_attempts
    FROM public.profiles p
    LEFT JOIN filtered_entries fe ON fe.mobilizer_id=p.id
    LEFT JOIN public.duplicate_attempts da ON da.mobilizer_id=p.id
      AND (v_date_from IS NULL OR da.created_at>=v_date_from::timestamptz)
      AND (v_date_to IS NULL OR da.created_at<(v_date_to+1)::timestamptz)
      AND (v_ward_id IS NULL OR da.attempted_ward_id=v_ward_id)
      AND (v_centre_id IS NULL OR EXISTS (SELECT 1 FROM public.entries matched WHERE matched.id=da.matched_entry_id AND matched.polling_centre_id=v_centre_id))
      AND (v_station_id IS NULL OR EXISTS (SELECT 1 FROM public.entries matched WHERE matched.id=da.matched_entry_id AND matched.polling_station_id=v_station_id))
    WHERE p.role='mobilizer' AND p.status='approved'
      AND p.id <> '00000000-0000-4000-8000-000000000001'::UUID
      AND (v_mobilizer_id IS NULL OR p.id=v_mobilizer_id)
      AND (v_actor.role <> 'ward_coordinator' OR p.home_ward_id=v_actor.home_ward_id)
    GROUP BY p.id,p.full_name
  ),
  timeline AS (
    SELECT date_trunc('day',fe.captured_on)::date AS capture_date,count(*)::INTEGER AS entries
    FROM filtered_entries fe
    GROUP BY date_trunc('day',fe.captured_on)::date
  ),
  influencers AS (
    SELECT nc.ward_id,w.name AS ward_name,nc.type,count(*)::INTEGER AS contacts
    FROM public.network_contacts nc
    JOIN public.wards w ON w.id=nc.ward_id
    LEFT JOIN public.polling_stations ps ON ps.id=nc.polling_station_id
    LEFT JOIN public.polling_centres pc ON pc.id=ps.polling_centre_id
    WHERE v_actor.role IN ('admin','ward_coordinator')
      AND (v_ward_id IS NULL OR nc.ward_id=v_ward_id)
      AND (v_centre_id IS NULL OR pc.id=v_centre_id)
      AND (v_station_id IS NULL OR ps.id=v_station_id)
      AND (v_date_from IS NULL OR nc.created_at>=v_date_from::timestamptz)
      AND (v_date_to IS NULL OR nc.created_at<(v_date_to+1)::timestamptz)
      AND (v_actor.role <> 'ward_coordinator' OR nc.ward_id=v_actor.home_ward_id)
    GROUP BY nc.ward_id,w.name,nc.type
  )
  SELECT jsonb_build_object(
    'role',v_actor.role::text,
    'totals',jsonb_build_object(
      'entries',totals.entry_count,
      'valid_ids',totals.valid_id_count,
      'valid_phones',totals.valid_phone_count,
      'mapped_places',totals.mapped_place_count,
      'assessed_support',totals.assessed_support_count,
      'verified',totals.verified_count,
      'matched_register',totals.matched_register_count,
      'id_coverage_pct',CASE WHEN totals.entry_count>0 THEN round(100.0*totals.valid_id_count/totals.entry_count,1) ELSE 0 END,
      'phone_coverage_pct',CASE WHEN totals.entry_count>0 THEN round(100.0*totals.valid_phone_count/totals.entry_count,1) ELSE 0 END,
      'mapped_place_pct',CASE WHEN totals.entry_count>0 THEN round(100.0*totals.mapped_place_count/totals.entry_count,1) ELSE 0 END,
      'assessed_support_pct',CASE WHEN totals.entry_count>0 THEN round(100.0*totals.assessed_support_count/totals.entry_count,1) ELSE 0 END
    ),
    'wards',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.ward_name),'[]'::jsonb) FROM ward_totals x),
    'stations',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.ward,x.centre,x.station),'[]'::jsonb) FROM station_totals x),
    'priority_stations',(SELECT coalesce(jsonb_agg(to_jsonb(y) ORDER BY (y.coverage_pct IS NOT NULL) DESC,y.coverage_pct ASC,y.entries ASC,y.station),'[]'::jsonb)
      FROM (SELECT x.* FROM station_totals x ORDER BY (x.coverage_pct IS NOT NULL) DESC,x.coverage_pct ASC,x.entries ASC,x.station LIMIT 10) y),
    'support',(SELECT coalesce(jsonb_agg(jsonb_build_object('support_level',level,'entries',entries) ORDER BY level),'[]'::jsonb) FROM support_breakdown),
    'ward_support',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.ward_name,x.support_level),'[]'::jsonb) FROM ward_support x),
    'verification',(SELECT coalesce(jsonb_agg(jsonb_build_object('verification_status',status,'entries',entries) ORDER BY status),'[]'::jsonb) FROM verification_funnel),
    'top_issues',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.ward_name,x.entries DESC,x.issue),'[]'::jsonb) FROM issue_totals x),
    'mobilizer_quality',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.entries DESC,x.mobilizer),'[]'::jsonb) FROM mobilizer_quality x),
    'timeline',(SELECT coalesce(jsonb_agg(jsonb_build_object('capture_date',capture_date,'entries',entries) ORDER BY capture_date),'[]'::jsonb) FROM timeline),
    'influencers',(SELECT coalesce(jsonb_agg(jsonb_build_object('ward_id',ward_id,'ward_name',ward_name,'type',type,'contacts',contacts) ORDER BY ward_name,type),'[]'::jsonb) FROM influencers)
  ) INTO v_result FROM totals;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.dashboard_metrics(JSONB) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.dashboard_metrics(JSONB) TO authenticated;
