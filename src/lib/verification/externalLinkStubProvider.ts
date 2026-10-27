import { VerificationProvider, VerificationRequest, VerificationResult } from './types.ts';

export interface ExternalLinkConfig {
  baseUrl: string;
  apiKey: string;
  rateLimitPerMinute: number;
  isAuthorizedByIebc: boolean;
  enabledByAdmin: boolean;
}

export class ExternalLinkStubProvider implements VerificationProvider {
  id = 'external_link' as const;
  name = 'External Link Provider (Disabled Stub)';
  description = 'Dormant stub for official API connectivity. Disabled by design to prevent unauthorized scraping or scraping of third-party portals.';
  isEnabled = false; // DISABLED BY DESIGN

  private config: ExternalLinkConfig = {
    baseUrl: 'https://api.voter-lookup.example.ke/v1/verify',
    apiKey: '',
    rateLimitPerMinute: 5,
    isAuthorizedByIebc: false,
    enabledByAdmin: false
  };

  // Sliding window rate limiter tracker: userId -> timestamp[]
  private rateLimitTracker = new Map<string, number[]>();

  constructor(customConfig?: Partial<ExternalLinkConfig>) {
    if (customConfig) {
      this.config = { ...this.config, ...customConfig };
      this.isEnabled = Boolean(this.config.enabledByAdmin && this.config.isAuthorizedByIebc);
    }
  }

  /**
   * Check rate limit: 5 requests per minute per user
   */
  private checkRateLimit(userId: string = 'default-user'): { allowed: boolean; remaining: number } {
    const now = Date.now();
    const windowMs = 60 * 1000;
    const timestamps = (this.rateLimitTracker.get(userId) || []).filter(t => now - t < windowMs);

    if (timestamps.length >= this.config.rateLimitPerMinute) {
      return { allowed: false, remaining: 0 };
    }

    timestamps.push(now);
    this.rateLimitTracker.set(userId, timestamps);
    return {
      allowed: true,
      remaining: this.config.rateLimitPerMinute - timestamps.length
    };
  }

  async verify(request: VerificationRequest): Promise<VerificationResult> {
    const now = new Date().toISOString();

    // STRICT SAFEGUARD: Provider is disabled until IEBC written authorisation is verified
    if (!this.config.isAuthorizedByIebc || !this.config.enabledByAdmin) {
      return {
        entryId: request.entryId,
        status: 'unverified',
        confidence: 0,
        providerName: this.id,
        evidenceNote: 'EXTERNAL_LINK_DISABLED: This adapter is dormant. Campaign must confirm written IEBC authorization before enabling external connectivity. Automated scraping is strictly prohibited under Kenya Computer Misuse and Cybercrimes Act 2018.',
        verifiedAt: now
      };
    }

    // Rate limit check
    const rateLimit = this.checkRateLimit();
    if (!rateLimit.allowed) {
      return {
        entryId: request.entryId,
        status: 'unverified',
        confidence: 0,
        providerName: this.id,
        evidenceNote: 'RATE_LIMIT_EXCEEDED: Maximum 5 external queries per minute reached. Request throttled.',
        verifiedAt: now,
        rateLimitRemaining: 0
      };
    }

    // In a future phase when official authorization is granted:
    // HTTP client would execute a query against this.config.baseUrl with this.config.apiKey.
    // For now, it returns a stub response:
    return {
      entryId: request.entryId,
      status: 'unverified',
      confidence: 0,
      providerName: this.id,
      evidenceNote: 'Stub response: connectivity mock ready for authorization token.',
      verifiedAt: now,
      rateLimitRemaining: rateLimit.remaining
    };
  }

  async verifyBatch(requests: VerificationRequest[]): Promise<VerificationResult[]> {
    const results: VerificationResult[] = [];
    for (const req of requests) {
      results.push(await this.verify(req));
    }
    return results;
  }

  updateConfig(newConfig: Partial<ExternalLinkConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.isEnabled = Boolean(this.config.enabledByAdmin && this.config.isAuthorizedByIebc);
  }

  getConfig(): ExternalLinkConfig {
    return { ...this.config };
  }
}
