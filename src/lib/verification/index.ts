import { VerificationProvider, VerificationRequest, VerificationResult, VerificationProviderConfig } from './types.ts';
import { RegisterImportProvider } from './registerImportProvider.ts';
import { ManualVerificationProvider } from './manualProvider.ts';

export * from './types.ts';
export * from './registerImportProvider.ts';
export * from './manualProvider.ts';

export class VerificationEngine {
  private registerImportProvider: RegisterImportProvider;
  private manualProvider: ManualVerificationProvider;

  private config: VerificationProviderConfig = {
    activeProvider: 'register_import',
    registerImportEnabled: true,
    manualEnabled: true,
  };

  constructor() {
    this.registerImportProvider = new RegisterImportProvider();
    this.manualProvider = new ManualVerificationProvider();
  }

  getProvider(id: 'register_import' | 'manual'): VerificationProvider {
    switch (id) {
      case 'register_import':
        return this.registerImportProvider;
      case 'manual':
        return this.manualProvider;
    }
  }

  getActiveProvider(): VerificationProvider {
    return this.getProvider(this.config.activeProvider);
  }

  setActiveProvider(providerId: 'register_import' | 'manual'): void {
    this.config.activeProvider = providerId;
  }

  getConfig(): VerificationProviderConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<VerificationProviderConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  async verifyEntry(request: VerificationRequest): Promise<VerificationResult> {
    // If manual override exists, it takes precedence
    const manualResult = await this.manualProvider.verify(request);
    if (manualResult.status !== 'unverified') {
      return manualResult;
    }

    // Otherwise dispatch to the active provider
    const provider = this.getActiveProvider();
    return provider.verify(request);
  }
}

// Global singleton instance for application use
export const verificationEngine = new VerificationEngine();
