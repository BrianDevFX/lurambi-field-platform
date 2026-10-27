import { VerificationProvider, VerificationRequest, VerificationResult } from './types.ts';
import { VerificationStatus } from '../../types/index.ts';

export interface ManualVerificationOverride {
  entryId: string;
  newStatus: VerificationStatus;
  evidenceNote: string;
  verifiedByUserId: string;
  verifiedByUserName: string;
}

export class ManualVerificationProvider implements VerificationProvider {
  id = 'manual' as const;
  name = 'Manual Field Verification';
  description = 'Authorised field officers or campaign admins manually confirm voter status with mandatory audit evidence.';
  isEnabled = true;

  private manualOverrides = new Map<string, ManualVerificationOverride>();

  /**
   * Sets or updates a manual status with mandatory justification
   */
  recordManualVerification(override: ManualVerificationOverride): void {
    if (!override.evidenceNote || override.evidenceNote.trim().length < 5) {
      throw new Error('Mandatory evidence note required for manual verification (min 5 characters).');
    }
    this.manualOverrides.set(override.entryId, override);
  }

  async verify(request: VerificationRequest): Promise<VerificationResult> {
    const override = this.manualOverrides.get(request.entryId);
    const now = new Date().toISOString();

    if (override) {
      return {
        entryId: request.entryId,
        status: override.newStatus,
        confidence: 1.0,
        providerName: this.id,
        evidenceNote: `Manually marked as ${override.newStatus} by ${override.verifiedByUserName}. Note: "${override.evidenceNote}"`,
        verifiedAt: now
      };
    }

    // Default if not yet manually assessed
    return {
      entryId: request.entryId,
      status: 'unverified',
      confidence: 0,
      providerName: this.id,
      evidenceNote: 'Awaiting manual verification by ward field verifier.',
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

  /**
   * Bulk processes an uploaded verifier results sheet (e.g. CSV/XLSX with ID, status, note)
   */
  processBulkResultsSheet(
    rows: Array<{ nationalId: string; status: VerificationStatus; notes: string }>,
    entriesList: Array<{ id: string; rawId?: string | number; idHash?: string }>,
    verifiedByUserName: string
  ): number {
    let count = 0;
    for (const row of rows) {
      const match = entriesList.find(e => 
        String(e.rawId) === String(row.nationalId) || 
        (e.idHash && e.idHash.startsWith(String(row.nationalId)))
      );

      if (match) {
        this.recordManualVerification({
          entryId: match.id,
          newStatus: row.status,
          evidenceNote: row.notes || `Bulk verified from official results sheet on ${new Date().toLocaleDateString()}`,
          verifiedByUserId: 'usr-admin-manual',
          verifiedByUserName
        });
        count++;
      }
    }
    return count;
  }
}
