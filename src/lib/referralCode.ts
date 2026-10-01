/**
 * Referral codes (plan WP6).
 *
 * The event promotion planner built its codes as btoa(email).substring(0, 8),
 * which is the first six characters of the visitor's email in base64: anyone
 * holding a code could read the start of the address back out of it. Codes
 * are random now and carry nothing about the person.
 *
 * The alphabet drops 0/O, 1/I/L and U so a code read aloud or copied by hand
 * survives. 30 symbols over 8 characters is about 6.6e11 codes. The same
 * alphabet and length are used by generate_referral_code() in
 * 20261006000002_profile_referral_codes.sql, so a profile code and a planner
 * code look alike and REFERRAL_CODE_PATTERN accepts both.
 */

export const REFERRAL_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
export const REFERRAL_CODE_LENGTH = 8;
export const REFERRAL_CODE_PATTERN = /^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/;

/**
 * A random code from crypto.getRandomValues. Bytes at or above the largest
 * multiple of the alphabet size are redrawn, so no symbol is favoured.
 */
export function generateReferralCode(): string {
  const n = REFERRAL_CODE_ALPHABET.length;
  const limit = 256 - (256 % n);
  let code = '';
  const buf = new Uint8Array(REFERRAL_CODE_LENGTH * 2);
  while (code.length < REFERRAL_CODE_LENGTH) {
    crypto.getRandomValues(buf);
    for (const byte of buf) {
      if (byte >= limit) continue;
      code += REFERRAL_CODE_ALPHABET[byte % n];
      if (code.length === REFERRAL_CODE_LENGTH) break;
    }
  }
  return code;
}

/** The code in canonical form, or null when it is not one of ours. */
export function normalizeReferralCode(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return REFERRAL_CODE_PATTERN.test(code) ? code : null;
}
