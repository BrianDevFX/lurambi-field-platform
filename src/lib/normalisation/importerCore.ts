import * as XLSX from 'xlsx';
import { normaliseKenyanPhone } from './phone.ts';
import { normaliseNationalId } from './nationalId.ts';
import { matchWard } from './wardMatcher.ts';
import { matchPollingPlace } from './placeMatcher.ts';
import { normaliseSupportLevel } from './supportLevel.ts';
import { LegacyWorkbookRow } from '../synthetic/legacyWorkbookData.ts';
import { Entry, NetworkContact, VerificationStatus } from '../../types/index.ts';

export interface ProcessedImportRow {
  rowId: string;
  sourceSheet: string;
  rawName: string;
  cleanName: string;
  rawId?: string | number;
  nationalIdMasked: string | null;
  nationalIdHash: string | null;
  rawPhone?: string | number;
  phoneE164: string | null;
  rawWard?: string;
  canonicalWardId: string | null;
  canonicalWardName: string | null;
  rawPlace?: string;
  canonicalCentreName: string | null;
  canonicalStationName: string | null;
  supportLevel: string;
  legacyMobilizerLabel: string | null;
  capturedOn: string;
  verificationStatus: VerificationStatus;
  flags: string[];
  status: 'imported' | 'merged_duplicate' | 'rejected' | 'flagged' | 'unmapped';
  reason?: string;
}

export interface DryRunReport {
  totalRowsProcessed: number;
  voterRows: number;
  pastorRows: number;
  chpRows: number;
  validIdsCount: number;
  pendingIdsCount: number;
  invalidIdsCount: number;
  validPhonesCount: number;
  invalidPhonesCount: number;
  sharedPhonesCount: number;
  resolvedWardsCount: number;
  unresolvedWardsCount: number;
  resolvedPlacesCount: number;
  junkPlacesCount: number;
  misusedSupportLevelCount: number;
  crossTabDuplicatesMergedCount: number;
  sampleRows: ProcessedImportRow[];
}

export function processWorkbookData(
  sheets: Record<string, LegacyWorkbookRow[]>
): {
  report: DryRunReport;
  processedEntries: ProcessedImportRow[];
  pastors: NetworkContact[];
  chps: NetworkContact[];
} {
  const processedEntries: ProcessedImportRow[] = [];
  const pastors: NetworkContact[] = [];
  const chps: NetworkContact[] = [];

  // Trackers for duplicates across tabs:
  // Keyed by idHash (if present) or normalised name + ward
  const seenVoters = new Map<string, ProcessedImportRow>();
  const phoneCounts = new Map<string, number>();

  let totalRows = 0;
  let voterCount = 0;
  let validIds = 0;
  let pendingIds = 0;
  let invalidIds = 0;
  let validPhones = 0;
  let invalidPhones = 0;
  let sharedPhones = 0;
  let resolvedWards = 0;
  let unresolvedWards = 0;
  let resolvedPlaces = 0;
  let junkPlaces = 0;
  let misusedSupport = 0;
  let mergedDuplicates = 0;

  // 1. Process Faith Leaders ("pastors" tab)
  if (sheets['pastors']) {
    for (const row of sheets['pastors']) {
      totalRows++;
      const phoneRes = normaliseKenyanPhone(row.phone);
      const wardRes = matchWard(row.ward);
      pastors.push({
        id: `pastor-${pastors.length + 1}`,
        type: 'pastor',
        name: row.name,
        phone_e164: phoneRes.phone_e164 || undefined,
        denomination: row.denomination || 'Unknown Fellowship',
        ward_id: wardRes.canonicalWardId || undefined,
        ward_name: wardRes.canonicalWardName || undefined,
        sub_county: 'Lurambi',
        reach_status: 'not_contacted',
        notes: `Imported from legacy pastors sheet (Row ${row.rowNumber})`,
        exclude_from_campaign_exports: false
      });
    }
  }

  // 2. Process Community Health Promoters ("chps tv" tab)
  if (sheets['chps tv']) {
    for (const row of sheets['chps tv']) {
      totalRows++;
      const phoneRes = normaliseKenyanPhone(row.phone);
      const wardRes = matchWard(row.ward);
      chps.push({
        id: `chp-${chps.length + 1}`,
        type: 'chp',
        name: row.name,
        phone_e164: phoneRes.phone_e164 || undefined,
        community_unit: row.communityUnit || 'Community Unit',
        ward_id: wardRes.canonicalWardId || undefined,
        ward_name: wardRes.canonicalWardName || undefined,
        sub_county: 'Lurambi',
        reach_status: 'not_contacted',
        notes: `Imported from legacy chps tv sheet. Neutral public worker status enforced.`,
        exclude_from_campaign_exports: true // Safe by default under public service rules
      });
    }
  }

  // 3. Process Voter Tabs
  // We process Raw Data first, followed by specific ward tabs and 'not found'
  const voterSheetNames = Object.keys(sheets).filter(s => s !== 'pastors' && s !== 'chps tv');

  for (const sheetName of voterSheetNames) {
    const rows = sheets[sheetName] || [];

    for (const row of rows) {
      totalRows++;
      voterCount++;

      const flags: string[] = [];

      // A. Normalise ID
      const idRes = normaliseNationalId(row.idNo);
      if (idRes.status === 'valid') {
        validIds++;
      } else if (idRes.status === 'missing') {
        pendingIds++;
        flags.push('MISSING_ID');
      } else {
        invalidIds++;
        flags.push('INVALID_ID');
      }

      // B. Normalise Phone
      const phoneRes = normaliseKenyanPhone(row.phone);
      if (phoneRes.isValid && phoneRes.phone_e164) {
        validPhones++;
        const p = phoneRes.phone_e164;
        const prevCount = phoneCounts.get(p) || 0;
        phoneCounts.set(p, prevCount + 1);
        if (prevCount >= 1) {
          sharedPhones++;
          flags.push('SHARED_PHONE');
        }
      } else {
        invalidPhones++;
        flags.push('INVALID_PHONE');
      }

      // C. Normalise Ward
      const wardRes = matchWard(row.ward);
      if (wardRes.canonicalWardId) {
        resolvedWards++;
      } else {
        unresolvedWards++;
        flags.push('UNMAPPED_PLACE');
      }

      // D. Normalise Polling Place
      const placeRes = matchPollingPlace(row.pollingPlace, wardRes.canonicalWardId);
      if (placeRes.matchedCentre) {
        resolvedPlaces++;
      } else if (placeRes.isJunk) {
        junkPlaces++;
        flags.push('UNMAPPED_PLACE');
      } else {
        flags.push('UNMAPPED_PLACE');
      }

      // E. Normalise Support Level
      const supportRes = normaliseSupportLevel(row.supportLevel);
      if (supportRes.isMisusedColumn) {
        misusedSupport++;
      }

      // F. Verification status
      let verStatus: VerificationStatus = 'unverified';
      if (sheetName.toLowerCase().includes('not found')) {
        verStatus = 'not_found';
      } else if (idRes.status === 'missing') {
        verStatus = 'pending_id';
      }

      // G. Determine deduplication key
      // If valid ID hash present, match on ID hash; otherwise name + ward
      const dedupeKey = idRes.idHash 
        ? `id:${idRes.idHash}` 
        : `name:${row.name.toLowerCase().trim()}:${wardRes.canonicalWardName || 'unknown'}`;

      const rawCapturedOn = row.date ? String(row.date) : '2024-03-01';

      if (seenVoters.has(dedupeKey)) {
        // Cross-tab duplicate detected!
        mergedDuplicates++;
        const existing = seenVoters.get(dedupeKey)!;
        
        // Rule: keep the earliest captured_on date
        if (new Date(rawCapturedOn) < new Date(existing.capturedOn)) {
          existing.capturedOn = rawCapturedOn;
          existing.reason = `Merged from ${sheetName} row ${row.rowNumber} (retained earlier date ${rawCapturedOn})`;
        }

        processedEntries.push({
          rowId: `${sheetName}-${row.rowNumber}`,
          sourceSheet: sheetName,
          rawName: row.name,
          cleanName: row.name.trim(),
          rawId: row.idNo,
          nationalIdMasked: idRes.maskedId,
          nationalIdHash: idRes.idHash,
          rawPhone: row.phone,
          phoneE164: phoneRes.phone_e164,
          rawWard: row.ward,
          canonicalWardId: wardRes.canonicalWardId,
          canonicalWardName: wardRes.canonicalWardName,
          rawPlace: row.pollingPlace,
          canonicalCentreName: placeRes.matchedCentre?.name || null,
          canonicalStationName: placeRes.matchedStation?.station_name || null,
          supportLevel: supportRes.supportLevel,
          legacyMobilizerLabel: supportRes.legacyMobilizerLabel,
          capturedOn: rawCapturedOn,
          verificationStatus: verStatus,
          flags: [...flags, 'DUPLICATE'],
          status: 'merged_duplicate',
          reason: `Duplicate of entry originally captured in ${existing.sourceSheet}`
        });
      } else {
        // New unique record
        const item: ProcessedImportRow = {
          rowId: `${sheetName}-${row.rowNumber}`,
          sourceSheet: sheetName,
          rawName: row.name,
          cleanName: row.name.trim(),
          rawId: row.idNo,
          nationalIdMasked: idRes.maskedId,
          nationalIdHash: idRes.idHash,
          rawPhone: row.phone,
          phoneE164: phoneRes.phone_e164,
          rawWard: row.ward,
          canonicalWardId: wardRes.canonicalWardId,
          canonicalWardName: wardRes.canonicalWardName,
          rawPlace: row.pollingPlace,
          canonicalCentreName: placeRes.matchedCentre?.name || null,
          canonicalStationName: placeRes.matchedStation?.station_name || null,
          supportLevel: supportRes.supportLevel,
          legacyMobilizerLabel: supportRes.legacyMobilizerLabel,
          capturedOn: rawCapturedOn,
          verificationStatus: verStatus,
          flags: flags,
          status: flags.length > 0 ? 'flagged' : 'imported',
          reason: flags.length > 0 ? flags.join(', ') : 'Clean import'
        };

        seenVoters.set(dedupeKey, item);
        processedEntries.push(item);
      }
    }
  }

  const report: DryRunReport = {
    totalRowsProcessed: totalRows,
    voterRows: voterCount,
    pastorRows: pastors.length,
    chpRows: chps.length,
    validIdsCount: validIds,
    pendingIdsCount: pendingIds,
    invalidIdsCount: invalidIds,
    validPhonesCount: validPhones,
    invalidPhonesCount: invalidPhones,
    sharedPhonesCount: sharedPhones,
    resolvedWardsCount: resolvedWards,
    unresolvedWardsCount: unresolvedWards,
    resolvedPlacesCount: resolvedPlaces,
    junkPlacesCount: junkPlaces,
    misusedSupportLevelCount: misusedSupport,
    crossTabDuplicatesMergedCount: mergedDuplicates,
    sampleRows: processedEntries.slice(0, 20)
  };

  return {
    report,
    processedEntries,
    pastors,
    chps
  };
}

/**
 * Generates an XLSX Import Report for download
 */
export function generateImportReportXlsx(processedEntries: ProcessedImportRow[]): Uint8Array {
  const wb = XLSX.utils.book_new();

  // Summary sheet
  const summaryData = [
    ['Lurambi Campaign Field Platform - Import Audit Report'],
    ['Generated At:', new Date().toISOString()],
    ['Total Rows Processed:', processedEntries.length],
    ['Clean / Imported:', processedEntries.filter(r => r.status === 'imported').length],
    ['Flagged (Imported with Flags):', processedEntries.filter(r => r.status === 'flagged').length],
    ['Merged as Duplicate:', processedEntries.filter(r => r.status === 'merged_duplicate').length],
    ['Pending ID Count:', processedEntries.filter(r => r.flags.includes('MISSING_ID')).length],
    ['Shared Phone Flag Count:', processedEntries.filter(r => r.flags.includes('SHARED_PHONE')).length],
    []
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  // Rows sheet
  const rowsData = processedEntries.map(r => ({
    'Status': r.status,
    'Source Sheet': r.sourceSheet,
    'Name': r.cleanName,
    'Masked ID': r.nationalIdMasked || 'N/A',
    'Phone (+254)': r.phoneE164 || 'INVALID',
    'Ward': r.canonicalWardName || `UNMAPPED (${r.rawWard})`,
    'Polling Place': r.canonicalCentreName || `UNMAPPED (${r.rawPlace})`,
    'Support Level': r.supportLevel,
    'Legacy Mobilizer': r.legacyMobilizerLabel || '',
    'Captured On': r.capturedOn,
    'Verification Status': r.verificationStatus,
    'Flags': r.flags.join('; '),
    'Audit Reason / Notes': r.reason || ''
  }));

  const wsRows = XLSX.utils.json_to_sheet(rowsData);
  XLSX.utils.book_append_sheet(wb, wsRows, 'Processed Entries');

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Uint8Array(out);
}
