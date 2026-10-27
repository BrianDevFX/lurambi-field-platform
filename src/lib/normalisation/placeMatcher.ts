import { CANONICAL_CENTRES, CANONICAL_ALIASES, CANONICAL_STATIONS } from '../../data/canonicalData.ts';
import { PollingCentre, PollingStation } from '../../types/index.ts';
import { calculateTrigramSimilarity } from './wardMatcher.ts';

export interface PlaceMatchResult {
  raw: string | null | undefined;
  matchedCentre: PollingCentre | null;
  matchedStation: PollingStation | null;
  isJunk: boolean;
  confidence: number;
  matchType: 'exact' | 'alias' | 'fuzzy' | 'junk' | 'unresolved';
  reason?: string;
  flags: string[];
}

// Known junk patterns observed in legacy Excel sheets
const JUNK_TERMS = new Set([
  'approved',
  'daisy',
  'uncle devi',
  'chief mutsembi',
  'lurambi',
  'yes',
  'no',
  'ok',
  'done',
  'unknown'
]);

export function matchPollingPlace(
  input: string | null | undefined,
  wardFilterId?: string | null
): PlaceMatchResult {
  if (!input || String(input).trim() === '') {
    return {
      raw: input,
      matchedCentre: null,
      matchedStation: null,
      isJunk: false,
      confidence: 0,
      matchType: 'unresolved',
      reason: 'Empty polling place value',
      flags: ['UNMAPPED_PLACE']
    };
  }

  const rawTrimmed = String(input).trim();
  const lower = rawTrimmed.toLowerCase();

  // 1. Detect junk values
  if (JUNK_TERMS.has(lower) || lower.length < 3) {
    return {
      raw: input,
      matchedCentre: null,
      matchedStation: null,
      isJunk: true,
      confidence: 0,
      matchType: 'junk',
      reason: `Identified as junk or misfiled text ("${rawTrimmed}")`,
      flags: ['UNMAPPED_PLACE']
    };
  }

  // 2. Direct exact or case-insensitive match against canonical centres
  const centres = wardFilterId
    ? CANONICAL_CENTRES.filter(c => c.ward_id === wardFilterId)
    : CANONICAL_CENTRES;

  const exactCentre = centres.find(c => c.name.toLowerCase() === lower);
  if (exactCentre) {
    const station = CANONICAL_STATIONS.find(s => s.polling_centre_id === exactCentre.id);
    return {
      raw: input,
      matchedCentre: exactCentre,
      matchedStation: station || null,
      isJunk: false,
      confidence: 1.0,
      matchType: 'exact',
      flags: []
    };
  }

  // 3. Check place_aliases seed
  const aliasMatch = CANONICAL_ALIASES.find(
    a => a.canonical_type === 'polling_centre' && a.raw_alias.toLowerCase().trim() === lower
  );

  if (aliasMatch) {
    if (aliasMatch.confidence === 0 || !aliasMatch.target_polling_centre_id) {
      return {
        raw: input,
        matchedCentre: null,
        matchedStation: null,
        isJunk: true,
        confidence: 0,
        matchType: 'junk',
        reason: aliasMatch.notes,
        flags: ['UNMAPPED_PLACE']
      };
    }

    const centre = CANONICAL_CENTRES.find(c => c.id === aliasMatch.target_polling_centre_id);
    if (centre) {
      const station = CANONICAL_STATIONS.find(s => s.polling_centre_id === centre.id);
      return {
        raw: input,
        matchedCentre: centre,
        matchedStation: station || null,
        isJunk: false,
        confidence: aliasMatch.confidence,
        matchType: 'alias',
        reason: aliasMatch.notes,
        flags: []
      };
    }
  }

  // 4. Fuzzy trigram matching against canonical centres
  let bestCentre: PollingCentre | null = null;
  let highestSim = 0;

  for (const centre of centres) {
    const sim = calculateTrigramSimilarity(rawTrimmed, centre.name);
    if (sim > highestSim) {
      highestSim = sim;
      bestCentre = centre;
    }
  }

  // Threshold >= 0.70 for centre match
  if (highestSim >= 0.70 && bestCentre) {
    const station = CANONICAL_STATIONS.find(s => s.polling_centre_id === bestCentre.id);
    return {
      raw: input,
      matchedCentre: bestCentre,
      matchedStation: station || null,
      isJunk: false,
      confidence: parseFloat(highestSim.toFixed(2)),
      matchType: 'fuzzy',
      flags: highestSim < 0.85 ? ['LOW_CONFIDENCE_MATCH'] : []
    };
  }

  // Unresolved -> Needs mapping queue
  return {
    raw: input,
    matchedCentre: null,
    matchedStation: null,
    isJunk: false,
    confidence: parseFloat(highestSim.toFixed(2)),
    matchType: 'unresolved',
    reason: 'Could not confidently match canonical polling centre',
    flags: ['UNMAPPED_PLACE']
  };
}
