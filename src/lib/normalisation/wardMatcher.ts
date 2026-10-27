import { CANONICAL_WARDS, CANONICAL_ALIASES } from '../../data/canonicalData.ts';
import { Ward } from '../../types/index.ts';

/**
 * Calculates trigram similarity (mirroring Postgres pg_trgm similarity function)
 */
export function calculateTrigramSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  const s1 = `  ${str1.toLowerCase().trim()} `;
  const s2 = `  ${str2.toLowerCase().trim()} `;

  const getTrigrams = (s: string): Set<string> => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 2; i++) {
      set.add(s.slice(i, i + 3));
    }
    return set;
  };

  const tri1 = getTrigrams(s1);
  const tri2 = getTrigrams(s2);

  if (tri1.size === 0 || tri2.size === 0) return 0;

  let intersection = 0;
  tri1.forEach(t => {
    if (tri2.has(t)) intersection++;
  });

  const union = tri1.size + tri2.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export interface WardMatchResult {
  raw: string | null | undefined;
  matchedWard: Ward | null;
  canonicalWardId: string | null;
  canonicalWardName: string | null;
  confidence: number;
  matchType: 'exact' | 'alias' | 'fuzzy' | 'unresolved';
  flags: string[];
}

export function matchWard(input: string | null | undefined): WardMatchResult {
  if (!input || String(input).trim() === '') {
    return {
      raw: input,
      matchedWard: null,
      canonicalWardId: null,
      canonicalWardName: null,
      confidence: 0,
      matchType: 'unresolved',
      flags: ['UNMAPPED_PLACE']
    };
  }

  const rawTrimmed = String(input).trim();
  const lower = rawTrimmed.toLowerCase();

  // 1. Direct exact or case-insensitive match against canonical wards
  const exactMatch = CANONICAL_WARDS.find(w => w.name.toLowerCase() === lower);
  if (exactMatch) {
    return {
      raw: input,
      matchedWard: exactMatch,
      canonicalWardId: exactMatch.id,
      canonicalWardName: exactMatch.name,
      confidence: 1.0,
      matchType: 'exact',
      flags: []
    };
  }

  // 2. Check place_aliases seed
  const aliasMatch = CANONICAL_ALIASES.find(
    a => a.canonical_type === 'ward' && a.raw_alias.toLowerCase().trim() === lower
  );
  if (aliasMatch && aliasMatch.target_ward_id) {
    const ward = CANONICAL_WARDS.find(w => w.id === aliasMatch.target_ward_id);
    if (ward) {
      return {
        raw: input,
        matchedWard: ward,
        canonicalWardId: ward.id,
        canonicalWardName: ward.name,
        confidence: aliasMatch.confidence,
        matchType: 'alias',
        flags: []
      };
    }
  }

  // 3. Trigram fuzzy matching against canonical wards
  let bestWard: Ward | null = null;
  let highestSim = 0;

  for (const ward of CANONICAL_WARDS) {
    const sim = calculateTrigramSimilarity(rawTrimmed, ward.name);
    if (sim > highestSim) {
      highestSim = sim;
      bestWard = ward;
    }
  }

  // Threshold >= 0.65 for auto-mapping ward
  if (highestSim >= 0.65 && bestWard) {
    return {
      raw: input,
      matchedWard: bestWard,
      canonicalWardId: bestWard.id,
      canonicalWardName: bestWard.name,
      confidence: parseFloat(highestSim.toFixed(2)),
      matchType: 'fuzzy',
      flags: highestSim < 0.85 ? ['LOW_CONFIDENCE_MATCH'] : []
    };
  }

  // Unresolved -> Needs mapping queue
  return {
    raw: input,
    matchedWard: null,
    canonicalWardId: null,
    canonicalWardName: null,
    confidence: parseFloat(highestSim.toFixed(2)),
    matchType: 'unresolved',
    flags: ['UNMAPPED_PLACE']
  };
}
