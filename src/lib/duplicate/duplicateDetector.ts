import { Entry } from '../../types/index.ts';
import { calculateTrigramSimilarity } from '../normalisation/wardMatcher.ts';

export interface DuplicateCheckParams {
  name: string;
  phone_e164?: string | null;
  id_hash?: string | null;
  polling_centre_id?: string | null;
  polling_station_id?: string | null;
  ward_filed_id: string;
  excludeEntryId?: string;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;           // Blocking for mobilizer submission
  isPossibleDuplicate: boolean;   // Non-blocking amber flag
  matchReason?: string;
  similarityScore?: number;
  matchedEntry?: {
    id: string;
    name: string;
    maskedId?: string | null;
    phoneE164?: string | null;
    wardName: string;
    pollingCentreName?: string;
    capturedByMobilizerName?: string;
    capturedOn: string;
  };
}

/**
 * Duplicate Detector Engine
 * 
 * Rules:
 * 1. DUPLICATE (Blocking for mobilizer):
 *    - Match on normalised National ID (via salted id_hash), OR
 *    - When ID is missing (pending_id): Trigram name similarity >= 0.85 
 *      AND same polling centre/station AND (same phone OR same ward).
 *    - A shared phone alone is NEVER a duplicate.
 * 
 * 2. POSSIBLE_DUPLICATE (Non-blocking, Amber flag):
 *    - Name similarity 0.70 to 0.849 in the same polling centre or station.
 */
export function detectDuplicate(
  params: DuplicateCheckParams,
  existingEntries: Entry[]
): DuplicateCheckResult {
  const {
    name,
    phone_e164,
    id_hash,
    polling_centre_id,
    polling_station_id,
    ward_filed_id,
    excludeEntryId
  } = params;

  const candidateEntries = excludeEntryId 
    ? existingEntries.filter(e => e.id !== excludeEntryId)
    : existingEntries;

  // -------------------------------------------------------------
  // RULE 1: Exact National ID Match (Highest priority)
  // -------------------------------------------------------------
  if (id_hash) {
    const idMatch = candidateEntries.find(e => e.id_hash === id_hash);
    if (idMatch) {
      return {
        isDuplicate: true,
        isPossibleDuplicate: false,
        matchReason: `Exact National ID match (${idMatch.id_masked || 'ID on record'})`,
        similarityScore: 1.0,
        matchedEntry: {
          id: idMatch.id,
          name: idMatch.name,
          maskedId: idMatch.id_masked,
          phoneE164: idMatch.phone_e164,
          wardName: idMatch.ward_name,
          pollingCentreName: idMatch.polling_centre_name,
          capturedByMobilizerName: idMatch.mobilizer_name || 'System Legacy Import',
          capturedOn: idMatch.captured_on
        }
      };
    }
  }

  // -------------------------------------------------------------
  // RULE 2: Fuzzy Name Similarity + Place Match (When ID is missing)
  // -------------------------------------------------------------
  let bestPossibleMatch: { entry: Entry; score: number } | null = null;

  for (const entry of candidateEntries) {
    const nameSim = calculateTrigramSimilarity(name, entry.name);
    
    // Check if place matches (either same station or same centre)
    const placeMatches = Boolean(
      (polling_station_id && entry.polling_station_id && polling_station_id === entry.polling_station_id) ||
      (polling_centre_id && entry.polling_centre_id && polling_centre_id === entry.polling_centre_id)
    );

    // Check auxiliary anchor: same phone OR same filing ward
    const auxMatches = Boolean(
      (phone_e164 && entry.phone_e164 && phone_e164 === entry.phone_e164) ||
      (ward_filed_id === entry.ward_filed_id)
    );

    // (a) Definite Duplicate: Name Sim >= 0.85 + Place Match + Auxiliary Anchor
    if (nameSim >= 0.85 && placeMatches && auxMatches) {
      return {
        isDuplicate: true,
        isPossibleDuplicate: false,
        matchReason: `High name similarity (${(nameSim * 100).toFixed(0)}%) in same polling place (${entry.polling_centre_name || 'Centre'})`,
        similarityScore: parseFloat(nameSim.toFixed(2)),
        matchedEntry: {
          id: entry.id,
          name: entry.name,
          maskedId: entry.id_masked,
          phoneE164: entry.phone_e164,
          wardName: entry.ward_name,
          pollingCentreName: entry.polling_centre_name,
          capturedByMobilizerName: entry.mobilizer_name || 'Field Mobilizer',
          capturedOn: entry.captured_on
        }
      };
    }

    // (b) Possible Duplicate: Name Sim 0.70 - 0.849 in same place
    if (nameSim >= 0.70 && placeMatches) {
      if (!bestPossibleMatch || nameSim > bestPossibleMatch.score) {
        bestPossibleMatch = { entry, score: nameSim };
      }
    }
  }

  if (bestPossibleMatch) {
    return {
      isDuplicate: false,
      isPossibleDuplicate: true,
      matchReason: `Possible duplicate: ${(bestPossibleMatch.score * 100).toFixed(0)}% name similarity in same polling place`,
      similarityScore: parseFloat(bestPossibleMatch.score.toFixed(2)),
      matchedEntry: {
        id: bestPossibleMatch.entry.id,
        name: bestPossibleMatch.entry.name,
        maskedId: bestPossibleMatch.entry.id_masked,
        phoneE164: bestPossibleMatch.entry.phone_e164,
        wardName: bestPossibleMatch.entry.ward_name,
        pollingCentreName: bestPossibleMatch.entry.polling_centre_name,
        capturedByMobilizerName: bestPossibleMatch.entry.mobilizer_name || 'Field Mobilizer',
        capturedOn: bestPossibleMatch.entry.captured_on
      }
    };
  }

  // No duplicate found
  return {
    isDuplicate: false,
    isPossibleDuplicate: false
  };
}
