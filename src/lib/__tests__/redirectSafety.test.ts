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
  ['/%5Cevil.com', 'encoded backslash'],
  ['/%2F%5Cevil.com', 'encoded slash-backslash'],
  ['/\tevil.com', 'tab after the slash'],
  ['/\t/evil.com', 'tab the URL parser would strip to make //evil.com'],
  ['/\n/evil.com', 'newline the URL parser would strip'],
  ['/events\u0000', 'NUL byte'],
  ['JavaScript:alert(1)', 'mixed-case scheme'],
  ['https:/evil.com', 'scheme with one slash'],
  ['/user@evil.com', 'userinfo in the first segment'],
  ['/events?q=jazz\u0007', 'control character in the query'],
] as const;

const ACCEPTED = [
  '/',
  '/events',
  '/events/today',
  '/restaurants?open=now',
  '/a/b/c#frag',
  // WP2 item 1: all three used to come back as '/'.
  '/events?q=jazz%20night',
  '/events/abc?time=19:00',
  '/restaurants?cuisine=a%26b',
];

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

  it('keeps the query string the person was on (account plan WP2 item 1)', () => {
    expect(getSafeRedirectUrl('/events?q=jazz%20night')).toBe('/events?q=jazz%20night');
    expect(getSafeRedirectUrl('/events/abc?time=19:00')).toBe('/events/abc?time=19:00');
    expect(getSafeRedirectUrl('/restaurants?cuisine=a%26b')).toBe('/restaurants?cuisine=a%26b');
    expect(getSafeRedirectUrl('/events?q=jazz#results')).toBe('/events?q=jazz#results');
  });

  it('survives the redirect param being decoded once by URLSearchParams', () => {
    // /auth?redirect=%2Fevents%3Fq%3Djazz%2520night is what a link builder
    // produces; searchParams.get() hands back the once-decoded value.
    const redirect = new URLSearchParams('redirect=%2Fevents%3Fq%3Djazz%2520night').get('redirect');
    expect(getSafeRedirectUrl(redirect)).toBe('/events?q=jazz%20night');
  });

  it('falls back to the path, not the default, when only the query is broken', () => {
    expect(getSafeRedirectUrl('/events?q=%E0%A4%A', '/home')).toBe('/events');
    expect(getSafeRedirectUrl('/events#%', '/home')).toBe('/events');
    expect(isValidRedirectUrl('/events?q=%E0%A4%A')).toBe(false);
  });

  it('never returns an off-site destination whatever the fallback path does', () => {
    for (const [input] of REJECTED) {
      const out = getSafeRedirectUrl(input as string | null, '/fallback');
      expect(out).toBe('/fallback');
    }
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
