import { describe, expect, it } from 'vitest';
import { normaliseKenyanPhone } from './phone.ts';
import { normaliseNationalId } from './nationalId.ts';
import { matchWard } from './wardMatcher.ts';
import { matchPollingPlace } from './placeMatcher.ts';
import { normaliseSupportLevel } from './supportLevel.ts';
import { loginIdentifierToEmail, phoneToPseudoEmail } from '../auth/phoneLogin.ts';

describe('Kenyan phone normalization', () => {
  it.each([
    ['9 digits', '700000000', '+254700000000'],
    ['10 digits', '0700000000', '+254700000000'],
    ['12 digits', '254700000000', '+254700000000'],
    ['spaces', '0700 000 000', '+254700000000'],
  ])('normalizes %s', (_caseName, input, expected) => {
    const result = normaliseKenyanPhone(input);
    expect(result.isValid).toBe(true);
    expect(result.phone_e164).toBe(expected);
  });

  it('flags an 8-digit phone as invalid', () => {
    const result = normaliseKenyanPhone('70000000');
    expect(result.isValid).toBe(false);
    expect(result.flag).toBe('INVALID_PHONE');
  });
});

describe('Phone login address', () => {
  it('maps normalized Kenyan phones to deterministic pseudo-email addresses', () => {
    expect(phoneToPseudoEmail('0712 345 678')).toBe('254712345678@lurambi.invalid');
    expect(loginIdentifierToEmail('0712345678')).toBe('254712345678@lurambi.invalid');
  });

  it('allows the admin real-email login path', () => {
    expect(loginIdentifierToEmail('Admin@Example.org')).toBe('admin@example.org');
  });

  it('rejects invalid phone login identifiers', () => {
    expect(() => phoneToPseudoEmail('12345678')).toThrow('valid Kenyan mobile');
  });
});

describe('National ID validation and masking', () => {
  it.each([
    ['7-digit ID', '1111111', '11**111'],
    ['8-digit ID', '11111111', '11***111'],
  ])('accepts and masks a %s', (_caseName, input, expectedMask) => {
    const result = normaliseNationalId(input);
    expect(result.isValid).toBe(true);
    expect(result.maskedId).toBe(expectedMask);
    expect(result).not.toHaveProperty('idHash');
    expect(result).not.toHaveProperty('raw');
    expect(result).not.toHaveProperty('cleanId');
  });
});

describe('Ward normalization', () => {
  it.each([
    ['Shieywe', 'Sheywe'],
    ['Mahialako', 'Mahiakalo'],
    ['BUTSOTSO SOUTH', 'Butsotso South'],
    ['  Shirere  ', 'Shirere'],
  ])('maps %s to %s', (input, expected) => {
    expect(matchWard(input).canonicalWardName).toBe(expected);
  });
});

describe('Polling place normalization', () => {
  it.each(['Daisy', 'Approved'])('routes junk value %s to mapping', (input) => {
    const result = matchPollingPlace(input);
    expect(result.isJunk).toBe(true);
    expect(result.flags).toContain('UNMAPPED_PLACE');
  });

  it('maps the synthetic test alias chillpark', () => {
    expect(matchPollingPlace('chillpark').matchedCentre?.name).toBe('Muliro Gardens Community Hall');
  });

  it('maps the test alias with surrounding whitespace', () => {
    expect(matchPollingPlace('  Iyala  ').matchedCentre?.name).toBe('Eshisiru Primary School');
  });
});

describe('Support-level normalization', () => {
  it('maps a support label', () => {
    expect(normaliseSupportLevel('Strong Supporter').supportLevel).toBe('strong_supporter');
  });

  it('routes a synthetic name-like label to the legacy mobilizer field', () => {
    const result = normaliseSupportLevel('Synthetic Mobilizer Alpha');
    expect(result.supportLevel).toBe('not_assessed');
    expect(result.legacyMobilizerLabel).toBe('Synthetic Mobilizer Alpha');
  });
});
