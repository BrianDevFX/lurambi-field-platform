import { VerificationProvider, VerificationRequest, VerificationResult } from './types.ts';
import { calculateTrigramSimilarity } from '../normalisation/wardMatcher.ts';

export interface OfficialVoterRecord {
  id: string;
  nationalIdHash: string;
  fullName: string;
  constituency: string;
  wardId: string;
  wardName: string;
  pollingCentreId: string;
  pollingCentreName: string;
  voterNumber: string;
}

export class RegisterImportProvider implements VerificationProvider {
  id = 'register_import' as const;
  name = 'Register Import Matcher (IEBC Extract)';
  description = 'Matches supporter records against the internal voter_register table populated by authorized IEBC extracts.';
  isEnabled = true;

  private records: OfficialVoterRecord[] = [];

  constructor(customRegister?: OfficialVoterRecord[]) {
    if (customRegister) {
      this.records = customRegister;
    }
  }

  async verify(request: VerificationRequest): Promise<VerificationResult> {
    const now = new Date().toISOString();

    // 1. If National ID is missing, voter status is pending_id
    if (!request.nationalIdHash) {
      return {
        entryId: request.entryId,
        status: 'pending_id',
        confidence: 0,
        providerName: this.id,
        evidenceNote: 'National ID missing. Cannot match against official voter register.',
        verifiedAt: now
      };
    }

    const searchHash = request.nationalIdHash;

    // 2. Search register by National ID Hash
    const matchedRecord = this.records.find(
      r => r.nationalIdHash === searchHash
    );

    if (matchedRecord) {
      // Check if registered in Lurambi vs neighboring constituency
      if (matchedRecord.constituency.toLowerCase() !== 'lurambi') {
        return {
          entryId: request.entryId,
          status: 'wrong_constituency',
          confidence: 1.0,
          providerName: this.id,
          evidenceNote: `Supporter registered in ${matchedRecord.constituency} Constituency (${matchedRecord.wardName}), not Lurambi.`,
          verifiedAt: now,
          matchedVoterRecord: {
            voterNumber: matchedRecord.voterNumber,
            constituency: matchedRecord.constituency,
            wardName: matchedRecord.wardName,
            pollingCentreName: matchedRecord.pollingCentreName
          }
        };
      }

      // Confirmed in Lurambi!
      return {
        entryId: request.entryId,
        status: 'verified',
        confidence: 1.0,
        providerName: this.id,
        evidenceNote: `Verified via official IEBC register extract. Voter #${matchedRecord.voterNumber} at ${matchedRecord.pollingCentreName}.`,
        verifiedAt: now,
        matchedVoterRecord: {
          voterNumber: matchedRecord.voterNumber,
          constituency: matchedRecord.constituency,
          wardName: matchedRecord.wardName,
          pollingCentreName: matchedRecord.pollingCentreName
        }
      };
    }

    // 3. Fallback: Fuzzy Name + Place match when ID is unindexed
    for (const record of this.records) {
      const nameSim = calculateTrigramSimilarity(request.name, record.fullName);
      if (nameSim >= 0.88 && record.wardId === request.wardId) {
        return {
          entryId: request.entryId,
          status: 'verified',
          confidence: parseFloat(nameSim.toFixed(2)),
          providerName: this.id,
          evidenceNote: `Fuzzy name match (${(nameSim * 100).toFixed(0)}%) with ${record.fullName} in ${record.wardName}.`,
          verifiedAt: now,
          matchedVoterRecord: {
            voterNumber: record.voterNumber,
            constituency: record.constituency,
            wardName: record.wardName,
            pollingCentreName: record.pollingCentreName
          }
        };
      }
    }

    // 4. Searched but not found
    return {
      entryId: request.entryId,
      status: 'not_found',
      confidence: 0.95,
      providerName: this.id,
      evidenceNote: `ID searched in authorized Lurambi voter register extract but not present on roll.`,
      verifiedAt: now
    };
  }

  async verifyBatch(requests: VerificationRequest[]): Promise<VerificationResult[]> {
    const results: VerificationResult[] = [];
    for (const req of requests) {
      results.push(await this.verify(req));
    }
    return results;
  }
}
