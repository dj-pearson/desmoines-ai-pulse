import { describe, it, expect } from 'vitest';
import { isValidRedirectUrl, getSafeRedirectUrl } from '@/lib/redirectSafety';
import { SecurityUtils } from '@/lib/securityUtils';

/**
 * This validator guards the OAuth callback against open redirects, and it was
 * extracted from SecurityUtils so AuthContext could stop dragging zod and
 * dompurify onto the critical path (WEB-PERF-020). Extraction is exactly when a
 * security check quietly changes behaviour, so both halves are pinned here: the
 * rules it enforces, and that the class still answers identically.
 */

const REJECTED = [
  ['', 'empty'],
  [null, 'null'],
  [undefined, 'undefined'],
  ['//evil.com', 'protocol-relative'],
  ['https://evil.com', 'absolute'],
  ['http://evil.com', 'absolute http'],
  ['javascript:alert(1)', 'javascript protocol'],
  ['/javascript:alert(1)', 'javascript protocol behind a slash'],
  ['data:text/html,<script>', 'data protocol'],
  ['vbscript:msgbox', 'vbscript protocol'],
  ['events', 'no leading slash'],
  ['/\\evil.com', 'backslash bypass'],
  ['/@evil.com', 'userinfo bypass'],
  ['/%2F%2Fevil.com', 'encoded protocol-relative'],
  ['/path:8080', 'embedded colon'],
] as const;

const ACCEPTED = ['/', '/events', '/events/today', '/restaurants?open=now', '/a/b/c#frag'];

describe('isValidRedirectUrl', () => {
  it.each(REJECTED)('rejects %s (%s)', (input) => {
    expect(isValidRedirectUrl(input as string | null)).toBe(false);
  });

  it.each(ACCEPTED)('accepts %s', (input) => {
    expect(isValidRedirectUrl(input)).toBe(true);
  });

  it('returns false for malformed percent-encoding instead of throwing', () => {
    // THE BUG THIS FILE WAS EXTRACTED WITH. decodeURIComponent('/%') raises a
    // URIError, and the decode ran before the pattern check that would have
    // rejected it. Both call sites sit inside AuthContext's OAuth try/catch, so
    // the throw surfaced as "Failed to sign in with Google" - a user arriving
    // with a malformed ?redirectTo could not sign in at all, and the message
    // blamed the provider.
    expect(() => isValidRedirectUrl('/%')).not.toThrow();
    expect(isValidRedirectUrl('/%')).toBe(false);
    expect(isValidRedirectUrl('/%zz')).toBe(false);
    expect(isValidRedirectUrl('/events/%E0%A4%A')).toBe(false);
  });

  it('trims before judging, so leading whitespace is not a bypass', () => {
    expect(isValidRedirectUrl('  /events  ')).toBe(true);
    expect(isValidRedirectUrl('  //evil.com')).toBe(false);
  });
});

describe('getSafeRedirectUrl', () => {
  it('passes a valid path through', () => {
    expect(getSafeRedirectUrl('/events')).toBe('/events');
  });

  it('falls back rather than returning anything that failed', () => {
    expect(getSafeRedirectUrl('//evil.com')).toBe('/');
    expect(getSafeRedirectUrl(null, '/dashboard')).toBe('/dashboard');
    expect(getSafeRedirectUrl('/%', '/dashboard')).toBe('/dashboard');
  });
});

describe('SecurityUtils still answers identically', () => {
  // The class is the API a dozen call sites use. If delegation ever drifts,
  // the security rule and the thing enforcing it stop being the same rule.
  it.each([...REJECTED.map(([u]) => u), ...ACCEPTED])('agrees on %s', (input) => {
    expect(SecurityUtils.isValidRedirectUrl(input as string | null)).toBe(
      isValidRedirectUrl(input as string | null),
    );
  });

  it('agrees on the malformed case too', () => {
    expect(SecurityUtils.isValidRedirectUrl('/%')).toBe(false);
    expect(SecurityUtils.getSafeRedirectUrl('/%', '/home')).toBe('/home');
  });
});
