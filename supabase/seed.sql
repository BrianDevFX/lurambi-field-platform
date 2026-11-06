-- Synthetic development-only fixture data. Replace places through the admin import
-- after review; never add real supporter identities or contact details to this file.
INSERT INTO public.wards (id, name, code, constituency_name, county_name, registered_voters_target)
VALUES
  ('a0000001-0000-4000-8000-000000000001', 'Sheywe', 'LUR-01', 'Lurambi', 'Kakamega', NULL),
  ('a0000001-0000-4000-8000-000000000002', 'Shirere', 'LUR-02', 'Lurambi', 'Kakamega', NULL),
  ('a0000001-0000-4000-8000-000000000003', 'Mahiakalo', 'LUR-03', 'Lurambi', 'Kakamega', NULL),
  ('a0000001-0000-4000-8000-000000000004', 'Butsotso East', 'LUR-04', 'Lurambi', 'Kakamega', NULL),
  ('a0000001-0000-4000-8000-000000000005', 'Butsotso South', 'LUR-05', 'Lurambi', 'Kakamega', NULL),
  ('a0000001-0000-4000-8000-000000000006', 'Butsotso Central', 'LUR-06', 'Lurambi', 'Kakamega', NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.polling_centres (id, ward_id, name, code, total_registered_voters)
VALUES
  ('b1000000-0000-4000-8000-000000000001', 'a0000001-0000-4000-8000-000000000001', 'Synthetic Polling Centre 01', 'SYN-PC-01', NULL),
  ('b1000000-0000-4000-8000-000000000002', 'a0000001-0000-4000-8000-000000000002', 'Synthetic Polling Centre 02', 'SYN-PC-02', NULL),
  ('b1000000-0000-4000-8000-000000000003', 'a0000001-0000-4000-8000-000000000003', 'Synthetic Polling Centre 03', 'SYN-PC-03', NULL),
  ('b1000000-0000-4000-8000-000000000004', 'a0000001-0000-4000-8000-000000000004', 'Synthetic Polling Centre 04', 'SYN-PC-04', NULL),
  ('b1000000-0000-4000-8000-000000000005', 'a0000001-0000-4000-8000-000000000005', 'Synthetic Polling Centre 05', 'SYN-PC-05', NULL),
  ('b1000000-0000-4000-8000-000000000006', 'a0000001-0000-4000-8000-000000000006', 'Synthetic Polling Centre 06', 'SYN-PC-06', NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.polling_stations (id, polling_centre_id, ward_id, station_name, station_number)
VALUES
  ('c1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'a0000001-0000-4000-8000-000000000001', 'Synthetic Station 01', 1),
  ('c1000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', 'a0000001-0000-4000-8000-000000000002', 'Synthetic Station 02', 1),
  ('c1000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000003', 'a0000001-0000-4000-8000-000000000003', 'Synthetic Station 03', 1),
  ('c1000000-0000-4000-8000-000000000004', 'b1000000-0000-4000-8000-000000000004', 'a0000001-0000-4000-8000-000000000004', 'Synthetic Station 04', 1),
  ('c1000000-0000-4000-8000-000000000005', 'b1000000-0000-4000-8000-000000000005', 'a0000001-0000-4000-8000-000000000005', 'Synthetic Station 05', 1),
  ('c1000000-0000-4000-8000-000000000006', 'b1000000-0000-4000-8000-000000000006', 'a0000001-0000-4000-8000-000000000006', 'Synthetic Station 06', 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.place_aliases (id, raw_alias, canonical_type, target_ward_id, confidence, notes)
VALUES
  ('d1000000-0000-4000-8000-000000000001', 'Shieywe', 'ward', 'a0000001-0000-4000-8000-000000000001', 0.99, 'Known ward spelling alias'),
  ('d1000000-0000-4000-8000-000000000002', 'Mahialako', 'ward', 'a0000001-0000-4000-8000-000000000003', 0.98, 'Known ward spelling alias'),
  ('d1000000-0000-4000-8000-000000000003', 'Butsotso south', 'ward', 'a0000001-0000-4000-8000-000000000005', 1.00, 'Known case variant')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.settings (key, value, description)
VALUES
  ('consent_policy', '{"enabled":false,"version":null}'::jsonb, 'Consent remains disabled until approved wording and version are configured.'),
  ('verification_providers', '{"register_import_enabled":true,"manual_enabled":true,"external_link_enabled":false}'::jsonb, 'Internal verification provider availability.'),
  ('chp_compliance_note', '{"visible":true,"exclude_default":true,"text":"CHP contacts are excluded from campaign exports by default; maintain public-service neutrality."}'::jsonb, 'Network contact export safeguards.'),
  ('share_message_template', '{"text":"You are invited to join the campaign supporter list."}'::jsonb, 'Default referral share message.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.network_contacts (id, type, name, phone_e164, denomination, ward_id, notes, exclude_from_campaign_exports)
SELECT
  ('d2000001-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'pastor',
  'Synthetic Pastor ' || lpad(n::text, 2, '0'),
  NULL,
  'Synthetic Fixture',
  (ARRAY[
    'a0000001-0000-4000-8000-000000000001'::uuid,
    'a0000001-0000-4000-8000-000000000002'::uuid,
    'a0000001-0000-4000-8000-000000000003'::uuid,
    'a0000001-0000-4000-8000-000000000004'::uuid,
    'a0000001-0000-4000-8000-000000000005'::uuid,
    'a0000001-0000-4000-8000-000000000006'::uuid
  ])[((n - 1) % 6) + 1],
  'SYNTHETIC TEST CONTACT - NOT A REAL PERSON',
  false
FROM generate_series(1, 10) AS n
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.network_contacts (id, type, name, phone_e164, community_unit, sub_county, ward_id, notes, exclude_from_campaign_exports)
SELECT
  ('d2000002-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'chp',
  'Synthetic CHP ' || lpad(n::text, 2, '0'),
  NULL,
  'Synthetic Unit ' || lpad(n::text, 2, '0'),
  'Synthetic Sub-county',
  (ARRAY[
    'a0000001-0000-4000-8000-000000000001'::uuid,
    'a0000001-0000-4000-8000-000000000002'::uuid,
    'a0000001-0000-4000-8000-000000000003'::uuid,
    'a0000001-0000-4000-8000-000000000004'::uuid,
    'a0000001-0000-4000-8000-000000000005'::uuid,
    'a0000001-0000-4000-8000-000000000006'::uuid
  ])[((n - 1) % 6) + 1],
  'SYNTHETIC TEST CONTACT - NOT A REAL PERSON',
  true
FROM generate_series(1, 10) AS n
ON CONFLICT (id) DO NOTHING;
