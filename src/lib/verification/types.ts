import { VerificationStatus } from '../../types/index.ts';

export interface VerificationRequest {
  entryId: string;
  name: string;
  nationalIdHash?: string | null;
  rawNationalId?: string | null;
  wardId: string;
  wardName?: string;
  pollingCentreId?: string | null;
  pollingCentreName?: string | null;
}

export interface VerificationResult {
  entryId: string;
  status: VerificationStatus;
  confidence: number;
  providerName: 'register_import' | 'manual' | 'external_link';
  evidenceNote: string;
  verifiedAt: string;
  matchedVoterRecord?: {
    voterNumber?: string;
    constituency: string;
    wardName: string;
    pollingCentreName: string;
  };
  rateLimitRemaining?: number;
}

export interface VerificationProvider {
  id: 'register_import' | 'manual' | 'external_link';
  name: string;
  description: string;
  isEnabled: boolean;
  verify(request: VerificationRequest): Promise<VerificationResult>;
  verifyBatch(requests: VerificationRequest[]): Promise<VerificationResult[]>;
}

export interface VerificationProviderConfig {
  activeProvider: 'register_import' | 'manual' | 'external_link';
  registerImportEnabled: boolean;
  manualEnabled: boolean;
  externalLinkEnabled: boolean;
  externalLinkBaseUrl: string;
  externalLinkRateLimitPerMin: number;
}
