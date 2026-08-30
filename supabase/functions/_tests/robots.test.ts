/**
 * robots.txt compliance (WEB-SEC-024).
 *
 * Every ingestion path in the project goes through scraper.ts's scrapeUrl, and
 * none of them checked robots.txt, so a site that had explicitly asked not to be
 * crawled was crawled anyway. Found while drafting the Privacy Policy's
 * categories-of-sources section (WEB-LEGAL-008), where the ordinary reassurance
 * that "we do not access anything that asks not to be crawled" would have been a
 * false statement in a legal document.
 *
 * These cover the parser and the path decision offline. The fetch and cache are
 * not covered -- they need a network -- but they are thin: fetch, slice, parse,
 * and return empty rules on any failure.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { parseRobots, isPathAllowed } from '../_shared/robots.ts';

const allowed = (txt: string, agent: string, path: string) =>
  isPathAllowed(parseRobots(txt, agent), path);

Deno.test('an empty or missing robots.txt allows everything', () => {
  assert(allowed('', 'chrome', '/anything'));
  assert(allowed('# just a comment\n', 'chrome', '/anything'));
});

Deno.test('a wildcard Disallow blocks the matching prefix and nothing else', () => {
  const txt = 'User-agent: *\nDisallow: /admin\n';
  assertEquals(allowed(txt, 'chrome', '/admin'), false);
  assertEquals(allowed(txt, 'chrome', '/admin/users'), false);
  assertEquals(allowed(txt, 'chrome', '/events'), true);
});

Deno.test('Disallow: / blocks the whole site', () => {
  const txt = 'User-agent: *\nDisallow: /\n';
  assertEquals(allowed(txt, 'chrome', '/'), false);
  assertEquals(allowed(txt, 'chrome', '/events/today'), false);
});

Deno.test('an empty Disallow value means allow everything', () => {
  // "Disallow:" with no path is the standard way to say "no restrictions", and
  // reading it as a prohibition would block every site that uses it.
  const txt = 'User-agent: *\nDisallow:\n';
  assert(allowed(txt, 'chrome', '/anything'));
});

Deno.test('Allow overrides a broader Disallow by longest match', () => {
  const txt = 'User-agent: *\nDisallow: /events\nAllow: /events/public\n';
  assertEquals(allowed(txt, 'chrome', '/events/private'), false);
  assertEquals(allowed(txt, 'chrome', '/events/public/one'), true);
});

Deno.test('an equal-length Allow and Disallow resolves to allowed', () => {
  const txt = 'User-agent: *\nDisallow: /x\nAllow: /x\n';
  assert(allowed(txt, 'chrome', '/x/y'));
});

Deno.test('a named group beats the wildcard group', () => {
  const txt = [
    'User-agent: *',
    'Disallow: /',
    '',
    'User-agent: DesMoinesInsiderBot',
    'Disallow: /private',
  ].join('\n');
  // The named group applies, so only /private is blocked.
  assertEquals(allowed(txt, 'DesMoinesInsiderBot/1.0', '/events'), true);
  assertEquals(allowed(txt, 'DesMoinesInsiderBot/1.0', '/private/x'), false);
  // An agent with no named group falls back to the wildcard, which blocks all.
  assertEquals(allowed(txt, 'Mozilla/5.0 Chrome/120', '/events'), false);
});

Deno.test('several User-agent lines share one rule set', () => {
  const txt = 'User-agent: alpha\nUser-agent: beta\nDisallow: /no\n';
  assertEquals(allowed(txt, 'alpha', '/no'), false);
  assertEquals(allowed(txt, 'beta', '/no'), false);
  assertEquals(allowed(txt, 'gamma', '/no'), true);
});

Deno.test('a User-agent line after a rule starts a new group', () => {
  // The bug this guards: treating the second agent as part of the first group
  // would apply /a to both, and /b to neither.
  const txt = 'User-agent: alpha\nDisallow: /a\nUser-agent: beta\nDisallow: /b\n';
  assertEquals(allowed(txt, 'alpha', '/a'), false);
  assertEquals(allowed(txt, 'alpha', '/b'), true);
  assertEquals(allowed(txt, 'beta', '/b'), false);
  assertEquals(allowed(txt, 'beta', '/a'), true);
});

Deno.test('comments and blank lines are ignored', () => {
  const txt = '# header\n\nUser-agent: *   # inline\n\nDisallow: /admin # why\n';
  assertEquals(allowed(txt, 'chrome', '/admin'), false);
  assertEquals(allowed(txt, 'chrome', '/ok'), true);
});

Deno.test('field names are case-insensitive', () => {
  const txt = 'USER-AGENT: *\nDISALLOW: /admin\n';
  assertEquals(allowed(txt, 'chrome', '/admin'), false);
});

Deno.test('a wildcard inside a path blocks conservatively, never less', () => {
  // Full * and $ matching is not implemented. `/search/*.json` is read as the
  // prefix `/search/`, which blocks MORE than asked. That direction costs a
  // page; the other direction is the defect this file exists to fix.
  const txt = 'User-agent: *\nDisallow: /search/*.json\n';
  assertEquals(allowed(txt, 'chrome', '/search/results.json'), false);
  assertEquals(allowed(txt, 'chrome', '/search/results.html'), false, 'conservative by design');
  assertEquals(allowed(txt, 'chrome', '/events'), true);
});

Deno.test('a rule appearing before any User-agent line is ignored', () => {
  const txt = 'Disallow: /orphan\nUser-agent: *\nDisallow: /real\n';
  assertEquals(allowed(txt, 'chrome', '/orphan'), true);
  assertEquals(allowed(txt, 'chrome', '/real'), false);
});
