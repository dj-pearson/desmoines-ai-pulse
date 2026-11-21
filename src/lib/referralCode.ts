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

/**
 * The count line under the invite link on the profile page (WEB-ADS-018). The
 * paid half appears only once at least one invite has subscribed: "0 went on
 * to subscribe" is noise on a card most members will never see move, and
 * before migration 20261107000105 the number is 0 for everyone regardless.
 */
export function referralCountLabel(stats: { signedUp: number; subscribed: number }): string {
  const signed =
    stats.signedUp === 1 ? '1 person has signed up' : `${stats.signedUp} people have signed up`;
  // get_my_referral_stats counts subscribed as a subset of signed_up today;
  // the clamp keeps a later change to it from printing "3 of 1".
  const paid = Math.min(stats.subscribed, stats.signedUp);
  if (paid <= 0) return `${signed} through your link so far.`;
  if (stats.signedUp === 1) return `${signed} through your link so far and went on to subscribe.`;
  return `${signed} through your link so far; ${paid} went on to subscribe.`;
}

/** utm_* an invite link carries (WEB-ADS-021). */
export const INVITE_UTM_SOURCE = 'referral';
export const INVITE_UTM_MEDIUM = 'invite';

/**
 * The share link on the invite card. `ref` is what useReferralCapture reads;
 * the utm pair is what campaignAttribution reads, so a newsletter signup that
 * came through a friend's invite is stored as utm_source=referral rather than
 * as no campaign at all. A bare ?ref link sent before this change still works:
 * the capture never needed the utm pair.
 */
export function inviteLink(baseUrl: string, code: string): string {
  const params = new URLSearchParams({
    ref: code,
    utm_source: INVITE_UTM_SOURCE,
    utm_medium: INVITE_UTM_MEDIUM,
  });
  return `${baseUrl.replace(/\/+$/, '')}/?${params.toString()}`;
}
