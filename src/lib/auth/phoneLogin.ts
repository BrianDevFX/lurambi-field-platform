import { normaliseKenyanPhone } from '../normalisation/phone.ts';

export function phoneToPseudoEmail(input: string): string {
  const result = normaliseKenyanPhone(input);
  if (!result.isValid || !result.phone_e164) {
    throw new Error('Enter a valid Kenyan mobile number.');
  }
  return `${result.phone_e164.slice(1)}@lurambi.invalid`;
}

export function loginIdentifierToEmail(input: string): string {
  const value = input.trim();
  if (value.includes('@')) return value.toLowerCase();
  return phoneToPseudoEmail(value);
}
