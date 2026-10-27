/**
 * Phone Number Normalisation Utility for Kenyan Mobile Numbers
 * 
 * Rules:
 * - 9 digits starting with 7 or 1 -> prefix '+254' (e.g. 712345678 -> +254712345678)
 * - 10 digits starting with 07 or 01 -> strip leading 0, prefix '+254' (e.g. 0712345678 -> +254712345678)
 * - 12 digits starting with 254 -> prefix '+' (e.g. 254712345678 -> +254712345678)
 * - 13 characters starting with +254 -> keep
 * - Formatting characters (spaces, dashes, parens) stripped
 * - Anything else -> flag as INVALID_PHONE
 */

export interface PhoneNormalisationResult {
  raw: string | number | null | undefined;
  phone_e164: string | null;
  isValid: boolean;
  flag?: 'INVALID_PHONE' | null;
  reason?: string;
}

export function normaliseKenyanPhone(input: string | number | null | undefined): PhoneNormalisationResult {
  if (input === null || input === undefined || String(input).trim() === '') {
    return {
      raw: input,
      phone_e164: null,
      isValid: false,
      flag: 'INVALID_PHONE',
      reason: 'Empty or missing phone number'
    };
  }

  // Convert to string and strip non-digit characters except leading plus
  let cleaned = String(input).trim();
  const hasLeadingPlus = cleaned.startsWith('+');
  cleaned = cleaned.replace(/[^0-9]/g, '');

  if (cleaned.length === 0) {
    return {
      raw: input,
      phone_e164: null,
      isValid: false,
      flag: 'INVALID_PHONE',
      reason: 'No numeric digits found'
    };
  }

  // Case 1: 9 digits starting with 7 or 1 (e.g. lost leading zero from Excel number format)
  if (cleaned.length === 9 && (cleaned.startsWith('7') || cleaned.startsWith('1'))) {
    return {
      raw: input,
      phone_e164: `+254${cleaned}`,
      isValid: true,
      flag: null
    };
  }

  // Case 2: 10 digits starting with 07 or 01 (standard local format e.g. 0712345678)
  if (cleaned.length === 10 && (cleaned.startsWith('07') || cleaned.startsWith('01'))) {
    return {
      raw: input,
      phone_e164: `+254${cleaned.slice(1)}`,
      isValid: true,
      flag: null
    };
  }

  // Case 3: 12 digits starting with 2547 or 2541 (international without plus)
  if (cleaned.length === 12 && (cleaned.startsWith('2547') || cleaned.startsWith('2541'))) {
    return {
      raw: input,
      phone_e164: `+${cleaned}`,
      isValid: true,
      flag: null
    };
  }

  // Case 4: Already +254 followed by valid 9 digits
  if (hasLeadingPlus && cleaned.length === 12 && (cleaned.startsWith('2547') || cleaned.startsWith('2541'))) {
    return {
      raw: input,
      phone_e164: `+${cleaned}`,
      isValid: true,
      flag: null
    };
  }

  // Anything else: (e.g. 8 digits, landline, foreign country code, malformed digits)
  return {
    raw: input,
    phone_e164: cleaned ? `+${cleaned}` : null,
    isValid: false,
    flag: 'INVALID_PHONE',
    reason: `Invalid Kenyan mobile format (length: ${cleaned.length}, digits: "${cleaned}")`
  };
}
