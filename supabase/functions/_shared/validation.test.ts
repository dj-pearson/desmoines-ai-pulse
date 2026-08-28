/**
 * SSRF-guard unit tests (WEB-SEC-011).
 * Run with: `deno test supabase/functions/_shared/validation.test.ts`
 *
 * Covers every private-address encoding class the old dotted-quad-only filter
 * missed: decimal/hex/octal/short IPv4, IPv4-in-IPv6, localhost/0.0.0.0, and
 * cloud-metadata addresses — while confirming real public URLs still pass.
 */
import { isPrivateIP, sanitizeLikeInput, sanitizePostgrestPattern, validateURLForSSRF } from './validation.ts';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

// --- Literal / localhost forms ---
Deno.test('blocks localhost + loopback variants', () => {
  for (const h of ['localhost', '127.0.0.1', '127.1', '127.0.0.255', '::1', '[::1]']) {
    assert(isPrivateIP(h), `${h} should be private`);
  }
});

Deno.test('blocks 0.0.0.0 / this-host forms', () => {
  for (const h of ['0.0.0.0', '0', '0x0']) assert(isPrivateIP(h), `${h} should be private`);
});

// --- Encoded IPv4 pointing at 169.254.169.254 (AWS/GCP metadata) ---
Deno.test('blocks decimal-encoded metadata IP', () => {
  // 169.254.169.254 = 2852039166 ; 127.0.0.1 = 2130706433
  assert(isPrivateIP('2852039166'), 'decimal metadata IP');
  assert(isPrivateIP('2130706433'), 'decimal loopback');
});

Deno.test('blocks hex- and octal-encoded loopback', () => {
  assert(isPrivateIP('0x7f000001'), 'hex loopback');
  assert(isPrivateIP('0177.0.0.1'), 'octal-leading loopback');
  assert(isPrivateIP('0xa9fea9fe'), 'hex metadata IP'); // 169.254.169.254
});

// --- IPv6 embedded / IPv4-mapped / metadata ---
Deno.test('blocks IPv4-mapped IPv6 to internal targets', () => {
  for (const h of ['::ffff:127.0.0.1', '::ffff:169.254.169.254', '[::ffff:10.0.0.1]']) {
    assert(isPrivateIP(h), `${h} should be private`);
  }
});

Deno.test('blocks IPv6 link-local, ULA, and EC2 metadata', () => {
  for (const h of ['fe80::1', 'fc00::1', 'fd00::1', 'fd00:ec2::254']) {
    assert(isPrivateIP(h), `${h} should be private`);
  }
});

// --- RFC1918 + link-local + CGNAT ---
Deno.test('blocks standard private ranges', () => {
  for (const h of ['10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1']) {
    assert(isPrivateIP(h), `${h} should be private`);
  }
});

// --- Public addresses must still pass ---
Deno.test('allows public IPs and hostnames', () => {
  for (const h of ['8.8.8.8', '1.1.1.1', '93.184.216.34', 'example.com', 'catchdesmoines.com', '172.15.0.1', '172.32.0.1']) {
    assert(!isPrivateIP(h), `${h} should be public`);
  }
});

// --- Full URL validation still works end-to-end ---
Deno.test('validateURLForSSRF rejects encoded-IP URLs, allows public https', () => {
  assert(!validateURLForSSRF('http://2130706433/').valid, 'decimal loopback URL blocked');
  assert(!validateURLForSSRF('http://[::ffff:169.254.169.254]/latest/meta-data/').valid, 'mapped metadata URL blocked');
  assert(!validateURLForSSRF('http://169.254.169.254/').valid, 'metadata URL blocked');
  assert(validateURLForSSRF('https://example.com/page').valid, 'public https allowed');
  assert(!validateURLForSSRF('ftp://example.com/').valid, 'non-http protocol blocked');
});

/**
 * LIKE/ILIKE sanitiser tests. There were none, which is how the apostrophe
 * stripping survived: nothing asserted what these functions preserve, only
 * (implicitly) that they removed things.
 */
// A literal backslash in this file has been mangled by more than one tool, so
// the expected values are built from a char code instead. The first version of
// these tests compared against '\%' written as a single backslash, which
// TypeScript reads as plain '%' - the assertion was wrong, not the sanitiser.
const BS = String.fromCharCode(92);

Deno.test('sanitizeLikeInput escapes wildcards and keeps real punctuation', () => {
  // The direction that matters. Stripping the apostrophe emptied every name
  // search mentioning one: against production, venue ilike with it returns 44
  // rows and without it returns 0.
  assert(sanitizeLikeInput("Casey's Center") === "Casey's Center", 'apostrophe preserved');
  assert(sanitizeLikeInput("Chef George's Steak Bar") === "Chef George's Steak Bar", 'apostrophe preserved in a longer name');

  // What it must still do: a bare wildcard cannot be allowed to match everything.
  assert(sanitizeLikeInput('%') === BS + '%', 'percent escaped');
  assert(sanitizeLikeInput('_') === BS + '_', 'underscore escaped');
  assert(sanitizeLikeInput('50% Off') === '50' + BS + '% Off', 'percent escaped mid-string');
  assert(sanitizeLikeInput('a_b') === 'a' + BS + '_b', 'underscore escaped mid-string');
  assert(sanitizeLikeInput('a' + BS + 'b') === 'a' + BS + BS + 'b', 'backslash escaped');
  assert(sanitizeLikeInput('drop;') === 'drop', 'semicolon removed');
  assert(sanitizeLikeInput('  padded  ') === 'padded', 'trimmed');
});

Deno.test('sanitizePostgrestPattern strips what PostgREST parses structurally', () => {
  // These four rewrite an or(...) filter, so they must go.
  for (const ch of [',', '(', ')', '*', '`']) {
    assert(!sanitizePostgrestPattern(`a${ch}b`).includes(ch), `${ch} stripped`);
  }
  // An apostrophe is NOT structural there - verified against production, the
  // same or(...) query answers 206 with 44 rows - so it survives here too.
  assert(sanitizePostgrestPattern("Casey's Center") === "Casey's Center", 'apostrophe survives');
  assert(sanitizePostgrestPattern('%') === BS + '%', 'wildcard still escaped');
});
