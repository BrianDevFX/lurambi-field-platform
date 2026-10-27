import { SupportLevel } from '../../types/index.ts';

export interface SupportLevelResult {
  raw: string | null | undefined;
  supportLevel: SupportLevel;
  legacyMobilizerLabel: string | null;
  isMisusedColumn: boolean;
  notes?: string;
}

const SUPPORT_ENUM_MAP: Record<string, SupportLevel> = {
  'strong supporter': 'strong_supporter',
  'strong_supporter': 'strong_supporter',
  'strong': 'strong_supporter',
  'diehard': 'strong_supporter',
  'leaning': 'leaning',
  'lean': 'leaning',
  'undecided': 'undecided',
  'neutral': 'undecided',
  'opposed': 'opposed',
  'against': 'opposed',
  'not reached': 'not_reached',
  'not_reached': 'not_reached',
  'not assessed': 'not_assessed',
  'not_assessed': 'not_assessed',
  'none': 'not_assessed'
};

export function normaliseSupportLevel(input: string | null | undefined): SupportLevelResult {
  if (!input || String(input).trim() === '') {
    return {
      raw: input,
      supportLevel: 'not_assessed',
      legacyMobilizerLabel: null,
      isMisusedColumn: false
    };
  }

  const rawTrimmed = String(input).trim();
  const lower = rawTrimmed.toLowerCase();

  // 1. Check if it matches an actual support level enum
  if (SUPPORT_ENUM_MAP[lower]) {
    return {
      raw: input,
      supportLevel: SUPPORT_ENUM_MAP[lower],
      legacyMobilizerLabel: null,
      isMisusedColumn: false
    };
  }

  // 2. Misused column detected!
  // In the Lurambi legacy workbook, names like "Zainab", "Mildred", "Erick" were entered into the SUPPORT LEVEL column.
  // Re-route this text to legacy_mobilizer_label for admin verification and set support_level to not_assessed.
  return {
    raw: input,
    supportLevel: 'not_assessed',
    legacyMobilizerLabel: rawTrimmed,
    isMisusedColumn: true,
    notes: `Preserved legacy mobilizer attribution "${rawTrimmed}" from misused support level column`
  };
}
