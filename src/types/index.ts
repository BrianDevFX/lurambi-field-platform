export type UserRole = 'admin' | 'ward_coordinator' | 'mobilizer';
export type UserStatus = 'pending' | 'approved' | 'suspended' | 'rejected';

export type VerificationStatus =
  | 'unverified'
  | 'verified'
  | 'not_found'
  | 'wrong_constituency'
  | 'pending_id';

export type SupportLevel =
  | 'strong_supporter'
  | 'leaning'
  | 'undecided'
  | 'opposed'
  | 'not_reached'
  | 'not_assessed';

export type EntrySource = 'legacy' | 'mobilizer' | 'self_registered';

export type NetworkContactType = 'pastor' | 'chp' | 'other';
export type ReachStatus = 'not_contacted' | 'contacted' | 'meeting_held';

export interface Ward {
  id: string;
  name: string;
  code: string;
  constituency_name: string;
  county_name: string;
  registered_voters_target: number;
}

export interface PollingCentre {
  id: string;
  ward_id: string;
  name: string;
  code: string;
  total_registered_voters: number;
}

export interface PollingStation {
  id: string;
  polling_centre_id: string;
  ward_id: string;
  station_name: string;
  station_number: number;
  registered_voters_est: number;
}

export interface PlaceAlias {
  id: string;
  raw_alias: string;
  canonical_type: 'ward' | 'polling_centre' | 'polling_station';
  target_ward_id?: string;
  target_polling_centre_id?: string;
  confidence: number;
  notes: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  phone_e164: string;
  national_id_masked: string;
  role: UserRole;
  status: UserStatus;
  home_ward_id?: string;
  home_ward_name?: string;
  referral_code?: string;
}

export interface Entry {
  id: string;
  mobilizer_id?: string;
  mobilizer_name?: string;
  ward_filed_id: string;
  ward_name: string;
  polling_centre_id?: string;
  polling_centre_name?: string;
  polling_station_id?: string;
  polling_station_name?: string;
  name: string;
  phone_e164?: string;
  id_masked?: string;
  id_hash?: string;
  support_level: SupportLevel;
  issues: string[];
  needs_transport: boolean;
  has_pvc: boolean;
  notes?: string;
  consent_at?: string;
  consent_text_version?: string;
  consent_status?: 'given' | 'legacy_unconfirmed' | 'revoked';
  source: EntrySource;
  verification_status: VerificationStatus;
  legacy_mobilizer_label?: string;
  captured_on: string;
  flags: string[];
}

export interface NetworkContact {
  id: string;
  type: NetworkContactType;
  name: string;
  phone_e164?: string;
  denomination?: string;
  community_unit?: string;
  sub_county: string;
  ward_id?: string;
  ward_name?: string;
  reach_status: ReachStatus;
  notes?: string;
  exclude_from_campaign_exports: boolean;
}
