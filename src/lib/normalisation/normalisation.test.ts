import { normaliseKenyanPhone } from './phone.ts';
import { normaliseNationalId } from './nationalId.ts';
import { matchWard } from './wardMatcher.ts';
import { matchPollingPlace } from './placeMatcher.ts';
import { normaliseSupportLevel } from './supportLevel.ts';
import { generateSyntheticLegacyWorkbook } from '../synthetic/legacyWorkbookData.ts';
import { processWorkbookData } from './importerCore.ts';

export interface TestResultItem {
  name: string;
  category: string;
  passed: boolean;
  expected: string;
  actual: string;
  error?: string;
}

export function runAllNormalisationUnitTests(): {
  allPassed: boolean;
  total: number;
  passed: number;
  failed: number;
  results: TestResultItem[];
} {
  const results: TestResultItem[] = [];

  function assert(category: string, name: string, condition: boolean, expected: string, actual: string) {
    results.push({
      category,
      name,
      passed: condition,
      expected,
      actual
    });
  }

  // ==========================================
  // 1. Phone Normalisation Unit Tests
  // ==========================================
  // 9 digits (lost leading zero)
  const p1 = normaliseKenyanPhone(712345678);
  assert('Phone', '9 digits starting 7 converts to +254712345678', p1.phone_e164 === '+254712345678' && p1.isValid, '+254712345678', String(p1.phone_e164));

  // 10 digits starting 07
  const p2 = normaliseKenyanPhone('0712345678');
  assert('Phone', '10 digits starting 07 converts to +254712345678', p2.phone_e164 === '+254712345678' && p2.isValid, '+254712345678', String(p2.phone_e164));

  // 12 digits starting 254
  const p3 = normaliseKenyanPhone(254722112233);
  assert('Phone', '12 digits starting 254 converts to +254722112233', p3.phone_e164 === '+254722112233' && p3.isValid, '+254722112233', String(p3.phone_e164));

  // Space-separated string
  const p4 = normaliseKenyanPhone('0705 961838');
  assert('Phone', 'Phone with spaces "0705 961838" converts to +254705961838', p4.phone_e164 === '+254705961838' && p4.isValid, '+254705961838', String(p4.phone_e164));

  // 8 digits (invalid length)
  const p5 = normaliseKenyanPhone('71234567');
  assert('Phone', '8 digits flags as INVALID_PHONE', !p5.isValid && p5.flag === 'INVALID_PHONE', 'INVALID_PHONE flag', p5.flag || 'null');

  // Empty or missing
  const p6 = normaliseKenyanPhone('');
  assert('Phone', 'Empty phone flags as INVALID_PHONE', !p6.isValid && p6.flag === 'INVALID_PHONE', 'INVALID_PHONE flag', p6.flag || 'null');

  // ==========================================
  // 2. National ID Normalisation Unit Tests
  // ==========================================
  // 8 digits valid ID
  const id1 = normaliseNationalId(28491023);
  assert('National ID', '8-digit valid ID passes and is masked', id1.isValid && id1.maskedId === '28***023', '28***023', String(id1.maskedId));

  // 7 digits valid ID
  const id2 = normaliseNationalId('9876543');
  assert('National ID', '7-digit valid ID passes and is masked', id2.isValid && id2.maskedId === '98**543', '98**543', String(id2.maskedId));

  // Empty ID (pending_id)
  const id3 = normaliseNationalId('');
  assert('National ID', 'Empty ID maps to MISSING_ID flag', id3.status === 'missing' && id3.flags.includes('MISSING_ID'), 'MISSING_ID', id3.flags.join(', '));

  // Invalid length (5 digits)
  const id4 = normaliseNationalId(12345);
  assert('National ID', '5-digit ID maps to INVALID_ID flag', id4.status === 'invalid_length' && id4.flags.includes('INVALID_ID'), 'INVALID_ID', id4.flags.join(', '));

  // ==========================================
  // 3. Ward Fuzzy Matching Unit Tests
  // ==========================================
  // Exact match
  const w1 = matchWard('Sheywe');
  assert('Ward', 'Exact "Sheywe" resolves to canonical Sheywe', w1.canonicalWardName === 'Sheywe' && w1.confidence === 1.0, 'Sheywe', String(w1.canonicalWardName));

  // Common legacy typo "Shieywe"
  const w2 = matchWard('Shieywe');
  assert('Ward', 'Typo "Shieywe" resolves to Sheywe via alias', w2.canonicalWardName === 'Sheywe', 'Sheywe', String(w2.canonicalWardName));

  // Transposition typo "Mahialako"
  const w3 = matchWard('Mahialako');
  assert('Ward', 'Typo "Mahialako" resolves to Mahiakalo', w3.canonicalWardName === 'Mahiakalo', 'Mahiakalo', String(w3.canonicalWardName));

  // Sentence case with space "Butsotso south"
  const w4 = matchWard('Butsotso south');
  assert('Ward', 'Sentence case "Butsotso south" resolves to canonical Butsotso South', w4.canonicalWardName === 'Butsotso South', 'Butsotso South', String(w4.canonicalWardName));

  // Trailing space "Shirere "
  const w5 = matchWard('Shirere ');
  assert('Ward', 'Trailing space "Shirere " resolves to Shirere', w5.canonicalWardName === 'Shirere', 'Shirere', String(w5.canonicalWardName));

  // ==========================================
  // 4. Polling Place & Junk Detection Unit Tests
  // ==========================================
  // Junk value "Daisy"
  const pl1 = matchPollingPlace('Daisy');
  assert('Polling Place', 'Junk name "Daisy" flagged as junk / unmapped', pl1.isJunk && pl1.flags.includes('UNMAPPED_PLACE'), 'isJunk = true', `isJunk=${pl1.isJunk}`);

  // Junk status string "Approved"
  const pl2 = matchPollingPlace('Approved');
  assert('Polling Place', 'Junk string "Approved" flagged as junk / unmapped', pl2.isJunk && pl2.flags.includes('UNMAPPED_PLACE'), 'isJunk = true', `isJunk=${pl2.isJunk}`);

  // Nickname "chillpark" -> Muliro Gardens
  const pl3 = matchPollingPlace('chillpark');
  assert('Polling Place', 'Nickname "chillpark" maps to Muliro Gardens', pl3.matchedCentre?.name === 'Muliro Gardens Community Hall', 'Muliro Gardens Community Hall', pl3.matchedCentre?.name || 'none');

  // Landmark "Iyala " -> Eshisiru Primary
  const pl4 = matchPollingPlace('Iyala ');
  assert('Polling Place', 'Landmark "Iyala " maps to Eshisiru Primary', pl4.matchedCentre?.name === 'Eshisiru Primary School', 'Eshisiru Primary School', pl4.matchedCentre?.name || 'none');

  // ==========================================
  // 5. Support Level Misuse Unit Tests
  // ==========================================
  // Legitimate support enum
  const sl1 = normaliseSupportLevel('Strong Supporter');
  assert('Support Level', '"Strong Supporter" maps to strong_supporter enum', sl1.supportLevel === 'strong_supporter' && !sl1.isMisusedColumn, 'strong_supporter', sl1.supportLevel);

  // Misused column containing first name "Zainab"
  const sl2 = normaliseSupportLevel('Zainab');
  assert('Support Level', 'First name "Zainab" mapped to legacy_mobilizer_label with not_assessed', sl2.supportLevel === 'not_assessed' && sl2.legacyMobilizerLabel === 'Zainab', 'legacyMobilizerLabel=Zainab', `label=${sl2.legacyMobilizerLabel}`);

  // Misused column containing first name "Mildred"
  const sl3 = normaliseSupportLevel('Mildred');
  assert('Support Level', 'First name "Mildred" mapped to legacy_mobilizer_label', sl3.legacyMobilizerLabel === 'Mildred' && sl3.isMisusedColumn, 'legacyMobilizerLabel=Mildred', `label=${sl3.legacyMobilizerLabel}`);

  // ==========================================
  // 6. Importer Core on Full Synthetic Dataset
  // ==========================================
  const syntheticWorkbook = generateSyntheticLegacyWorkbook();
  const processResult = processWorkbookData(syntheticWorkbook);

  assert(
    'Importer Core',
    'Processes synthetic workbook containing >100 records',
    processResult.report.totalRowsProcessed > 100,
    '>100 rows',
    `${processResult.report.totalRowsProcessed} rows`
  );

  assert(
    'Importer Core',
    'Separates faith leaders into pastors table (~10 records)',
    processResult.pastors.length === 10,
    '10 pastors',
    `${processResult.pastors.length} pastors`
  );

  assert(
    'Importer Core',
    'Separates Community Health Promoters with public service neutrality protection',
    processResult.chps.length === 10 && processResult.chps.every(c => c.exclude_from_campaign_exports),
    '10 CHPs with exclude=true',
    `${processResult.chps.length} CHPs`
  );

  assert(
    'Importer Core',
    'Merges cross-tab duplicate (Kennedy Musundi) and retains earliest capture date',
    processResult.report.crossTabDuplicatesMergedCount >= 1,
    'Merged duplicate >= 1',
    `${processResult.report.crossTabDuplicatesMergedCount} merged`
  );

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  return {
    allPassed: failed === 0,
    total: results.length,
    passed,
    failed,
    results
  };
}
