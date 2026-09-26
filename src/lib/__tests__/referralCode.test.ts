import { describe, it, expect } from 'vitest';
import {
  generateReferralCode,
  normalizeReferralCode,
  REFERRAL_CODE_ALPHABET,
  REFERRAL_CODE_PATTERN,
} from '@/lib/referralCode';

describe('referral codes (plan WP6)', () => {
  it('generates 8 characters from the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateReferralCode()).toMatch(REFERRAL_CODE_PATTERN);
    }
    expect(REFERRAL_CODE_ALPHABET).not.toMatch(/[01ILOU]/);
  });

  it('does not repeat across draws', () => {
    const seen = new Set(Array.from({ length: 500 }, () => generateReferralCode()));
    expect(seen.size).toBe(500);
  });

  it('carries nothing of an email: the old btoa prefix is not reproduced', () => {
    const email = 'someone@example.com';
    const old = btoa(email).substring(0, 8).toUpperCase();
    expect(generateReferralCode()).not.toBe(old);
  });

  it('normalizes case and rejects anything else', () => {
    expect(normalizeReferralCode(' abcd2345 ')).toBe('ABCD2345');
    expect(normalizeReferralCode('ABCD1234')).toBeNull(); // 1 is not in the alphabet
    expect(normalizeReferralCode('ABC')).toBeNull();
    expect(normalizeReferralCode("x' OR 1=1")).toBeNull();
    expect(normalizeReferralCode(null)).toBeNull();
  });
});
