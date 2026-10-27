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

// Sample official voter register extract loaded for Lurambi demonstration
export const SAMPLE_IEBC_REGISTER: OfficialVoterRecord[] = [
  {
    id: 'reg-01',
    nationalIdHash: '28491023_hash',
    fullName: 'BARASA WEKESA SYNTHETIC',
    constituency: 'Lurambi',
    wardId: 'a0000001-0000-0000-0000-000000000001',
    wardName: 'Sheywe',
    pollingCentreId: 'b0000001-0000-0000-0000-000000000001',
    pollingCentreName: 'Kakamega Primary School',
    voterNumber: 'IEBC-LUR-2022-09481'
  },
  {
    id: 'reg-02',
    nationalIdHash: '31204958_hash',
    fullName: 'OMONDI OTIENO FICTIONAL',
    constituency: 'Lurambi',
    wardId: 'a0000001-0000-0000-0000-000000000003',
    wardName: 'Mahiakalo',
    pollingCentreId: 'b0000003-0000-0000-0000-000000000002',
    pollingCentreName: 'MMUST (Masinde Muliro University)',
    voterNumber: 'IEBC-LUR-2022-11029'
  },
  {
    id: 'reg-03',
    nationalIdHash: '27182930_hash',
    fullName: 'KENNEDY MUSUNDI TEST',
    constituency: 'Lurambi',
    wardId: 'a0000001-0000-0000-0000-000000000001',
    wardName: 'Sheywe',
    pollingCentreId: 'b0000001-0000-0000-0000-000000000001',
    pollingCentreName: 'Kakamega Primary School',
    voterNumber: 'IEBC-LUR-2022-04820'
  },
  {
    id: 'reg-04',
    nationalIdHash: '33445566_hash',
    fullName: 'MERCYLINE AMBANI DEMO',
    constituency: 'Shinyalu', // Registered in neighboring Shinyalu!
    wardId: 'ext-shinyalu-01',
    wardName: 'Isukha East',
    pollingCentreId: 'ext-shinyalu-pc-01',
    pollingCentreName: 'Shinyalu Primary School',
    voterNumber: 'IEBC-SHI-2022-88201'
  }
];

export class RegisterImportProvider implements VerificationProvider {
  id = 'register_import' as const;
  name = 'Register Import Matcher (IEBC Extract)';
  description = 'Matches supporter records against the internal voter_register table populated by authorized IEBC extracts.';
  isEnabled = true;

  private records: OfficialVoterRecord[] = SAMPLE_IEBC_REGISTER;

  constructor(customRegister?: OfficialVoterRecord[]) {
    if (customRegister) {
      this.records = customRegister;
    }
  }

  async verify(request: VerificationRequest): Promise<VerificationResult> {
    const now = new Date().toISOString();

    // 1. If National ID is missing, voter status is pending_id
    if (!request.nationalIdHash && !request.rawNationalId) {
      return {
        entryId: request.entryId,
        status: 'pending_id',
        confidence: 0,
        providerName: this.id,
        evidenceNote: 'National ID missing. Cannot match against official voter register.',
        verifiedAt: now
      };
    }

    const searchHash = request.nationalIdHash || (request.rawNationalId ? `${request.rawNationalId}_hash` : '');

    // 2. Search register by National ID Hash
    const matchedRecord = this.records.find(
      r => r.nationalIdHash === searchHash || (request.rawNationalId && r.nationalIdHash.startsWith(String(request.rawNationalId)))
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
