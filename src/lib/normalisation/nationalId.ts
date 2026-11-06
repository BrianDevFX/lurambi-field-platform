/**
 * National ID validation and display masking.
 * Raw IDs are submitted to trusted database functions; this module never hashes IDs.
 */
export interface NationalIdResult {
  maskedId: string | null;
  isValid: boolean;
  status: 'valid' | 'missing' | 'invalid';
  flags: string[];
}

export function maskNationalId(id: string): string {
  const clean = id.trim();
  if (clean.length < 4) return '*'.repeat(clean.length);
  return `${clean.slice(0, 2)}${'*'.repeat(Math.max(2, clean.length - 5))}${clean.slice(-3)}`;
}

export function normaliseNationalId(input: string | number | null | undefined): NationalIdResult {
  if (input === null || input === undefined || String(input).trim() === '') {
    return {
      maskedId: null,
      isValid: false,
      status: 'missing',
      flags: ['MISSING_ID'],
    };
  }

  const cleaned = String(input).trim().replace(/[^0-9]/g, '');
  if (!cleaned) {
    return {
      maskedId: null,
      isValid: false,
      status: 'missing',
      flags: ['MISSING_ID'],
    };
  }

  const isValid = cleaned.length === 7 || cleaned.length === 8;
  return {
    maskedId: maskNationalId(cleaned),
    isValid,
    status: isValid ? 'valid' : 'invalid',
    flags: isValid ? [] : ['INVALID_ID'],
  };
}
