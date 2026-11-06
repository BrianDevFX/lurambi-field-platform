import { Ward, PollingCentre, PollingStation, PlaceAlias } from '../types/index.ts';

export const CANONICAL_WARDS: Ward[] = [
  { id: 'a0000001-0000-0000-0000-000000000001', name: 'Sheywe', code: 'LUR-01', constituency_name: 'Lurambi', county_name: 'Kakamega', registered_voters_target: 26500 },
  { id: 'a0000001-0000-0000-0000-000000000002', name: 'Shirere', code: 'LUR-02', constituency_name: 'Lurambi', county_name: 'Kakamega', registered_voters_target: 19400 },
  { id: 'a0000001-0000-0000-0000-000000000003', name: 'Mahiakalo', code: 'LUR-03', constituency_name: 'Lurambi', county_name: 'Kakamega', registered_voters_target: 18200 },
  { id: 'a0000001-0000-0000-0000-000000000004', name: 'Butsotso East', code: 'LUR-04', constituency_name: 'Lurambi', county_name: 'Kakamega', registered_voters_target: 17800 },
  { id: 'a0000001-0000-0000-0000-000000000005', name: 'Butsotso South', code: 'LUR-05', constituency_name: 'Lurambi', county_name: 'Kakamega', registered_voters_target: 16900 },
  { id: 'a0000001-0000-0000-0000-000000000006', name: 'Butsotso Central', code: 'LUR-06', constituency_name: 'Lurambi', county_name: 'Kakamega', registered_voters_target: 18500 }
];
export const CANONICAL_CENTRES: PollingCentre[] = [
  { id: 'b0000001-0000-0000-0000-000000000001', ward_id: 'a0000001-0000-0000-0000-000000000001', name: 'Kakamega Primary School', code: 'PC-SHEY-01', total_registered_voters: 3450 },
  { id: 'b0000001-0000-0000-0000-000000000002', ward_id: 'a0000001-0000-0000-0000-000000000001', name: 'Bukhungu Stadium Grounds', code: 'PC-SHEY-02', total_registered_voters: 2800 },
  { id: 'b0000001-0000-0000-0000-000000000003', ward_id: 'a0000001-0000-0000-0000-000000000001', name: 'Muliro Gardens Community Hall', code: 'PC-SHEY-03', total_registered_voters: 2100 },
  { id: 'b0000002-0000-0000-0000-000000000001', ward_id: 'a0000001-0000-0000-0000-000000000002', name: 'Amalemba Primary School', code: 'PC-SHIR-01', total_registered_voters: 2900 },
  { id: 'b0000002-0000-0000-0000-000000000002', ward_id: 'a0000001-0000-0000-0000-000000000002', name: 'Sigalagala National Polytechnic', code: 'PC-SHIR-02', total_registered_voters: 3100 },
  { id: 'b0000003-0000-0000-0000-000000000001', ward_id: 'a0000001-0000-0000-0000-000000000003', name: 'Mahiakalo Primary School', code: 'PC-MAH-01', total_registered_voters: 2600 },
  { id: 'b0000003-0000-0000-0000-000000000002', ward_id: 'a0000001-0000-0000-0000-000000000003', name: 'MMUST (Masinde Muliro University)', code: 'PC-MAH-02', total_registered_voters: 4200 },
  { id: 'b0000004-0000-0000-0000-000000000001', ward_id: 'a0000001-0000-0000-0000-000000000004', name: 'Shikoti Girls Secondary', code: 'PC-BE-01', total_registered_voters: 2400 },
  { id: 'b0000004-0000-0000-0000-000000000002', ward_id: 'a0000001-0000-0000-0000-000000000004', name: 'Eshisiru Primary School', code: 'PC-BE-02', total_registered_voters: 2150 },
  { id: 'b0000005-0000-0000-0000-000000000001', ward_id: 'a0000001-0000-0000-0000-000000000005', name: 'Bukura Agricultural College', code: 'PC-BS-01', total_registered_voters: 2700 },
  { id: 'b0000005-0000-0000-0000-000000000002', ward_id: 'a0000001-0000-0000-0000-000000000005', name: 'Emusire High School', code: 'PC-BS-02', total_registered_voters: 1950 },
  { id: 'b0000006-0000-0000-0000-000000000001', ward_id: 'a0000001-0000-0000-0000-000000000006', name: 'Lurambi Primary School', code: 'PC-BC-01', total_registered_voters: 2850 },
  { id: 'b0000006-0000-0000-0000-000000000002', ward_id: 'a0000001-0000-0000-0000-000000000006', name: 'Elukhambi Primary School', code: 'PC-BC-02', total_registered_voters: 2200 }
];

export const CANONICAL_STATIONS: PollingStation[] = [
  { id: 'c0000001-0000-0000-0000-000000000001', polling_centre_id: 'b0000001-0000-0000-0000-000000000001', ward_id: 'a0000001-0000-0000-0000-000000000001', station_name: 'Kakamega Primary - Stream 1', station_number: 1, registered_voters_est: 690 },
  { id: 'c0000001-0000-0000-0000-000000000002', polling_centre_id: 'b0000001-0000-0000-0000-000000000001', ward_id: 'a0000001-0000-0000-0000-000000000001', station_name: 'Kakamega Primary - Stream 2', station_number: 2, registered_voters_est: 690 },
  { id: 'c0000002-0000-0000-0000-000000000001', polling_centre_id: 'b0000002-0000-0000-0000-000000000001', ward_id: 'a0000001-0000-0000-0000-000000000002', station_name: 'Amalemba Primary - Stream 1', station_number: 1, registered_voters_est: 700 },
  { id: 'c0000003-0000-0000-0000-000000000001', polling_centre_id: 'b0000003-0000-0000-0000-000000000001', ward_id: 'a0000001-0000-0000-0000-000000000003', station_name: 'Mahiakalo Primary - Stream 1', station_number: 1, registered_voters_est: 650 },
  { id: 'c0000004-0000-0000-0000-000000000001', polling_centre_id: 'b0000004-0000-0000-0000-000000000001', ward_id: 'a0000001-0000-0000-0000-000000000004', station_name: 'Shikoti Girls - Stream 1', station_number: 1, registered_voters_est: 600 },
  { id: 'c0000005-0000-0000-0000-000000000001', polling_centre_id: 'b0000005-0000-0000-0000-000000000001', ward_id: 'a0000001-0000-0000-0000-000000000005', station_name: 'Bukura College - Stream 1', station_number: 1, registered_voters_est: 680 },
  { id: 'c0000006-0000-0000-0000-000000000001', polling_centre_id: 'b0000006-0000-0000-0000-000000000001', ward_id: 'a0000001-0000-0000-0000-000000000006', station_name: 'Lurambi Primary - Stream 1', station_number: 1, registered_voters_est: 710 }
];

export const CANONICAL_ALIASES: PlaceAlias[] = [
  { id: '1', raw_alias: 'Shieywe', canonical_type: 'ward', target_ward_id: 'a0000001-0000-0000-0000-000000000001', confidence: 0.99, notes: 'Common typo in Raw Data legacy tab' },
  { id: '2', raw_alias: 'Mahialako', canonical_type: 'ward', target_ward_id: 'a0000001-0000-0000-0000-000000000003', confidence: 0.98, notes: 'Typo letter transposition' },
  { id: '3', raw_alias: 'Butsotso south', canonical_type: 'ward', target_ward_id: 'a0000001-0000-0000-0000-000000000005', confidence: 1.0, notes: 'Sentence case variant' },
  { id: '4', raw_alias: 'chillpark', canonical_type: 'polling_centre', target_polling_centre_id: 'b0000001-0000-0000-0000-000000000003', confidence: 0.85, notes: 'Local informal nickname for Muliro Gardens open area' },
  { id: '5', raw_alias: 'Iyala ', canonical_type: 'polling_centre', target_polling_centre_id: 'b0000004-0000-0000-0000-000000000002', confidence: 0.80, notes: 'Trailing space + village landmark' },
  { id: '6', raw_alias: 'Daisy', canonical_type: 'polling_centre', confidence: 0.0, notes: 'Personal name entered into place column -> Needs Mapping' },
  { id: '7', raw_alias: 'uncle devi', canonical_type: 'polling_centre', confidence: 0.0, notes: 'Nickname in place column -> Needs Mapping' },
  { id: '8', raw_alias: 'Chief Mutsembi', canonical_type: 'polling_centre', confidence: 0.0, notes: 'Administrative landmark -> Needs Mapping' },
  { id: '9', raw_alias: 'Approved', canonical_type: 'polling_centre', confidence: 0.0, notes: 'Status string in place column -> Needs Mapping' }
];
