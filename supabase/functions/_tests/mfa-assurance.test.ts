/**
 * MFA assurance on admin endpoints (WEB-SEC-026).
 *
 * The bug this guards: signInWithPassword issues an aal1 access token before
 * any second factor is asked for. The browser can be told to hold that session
 * back, and now is, but the token itself is a valid GoTrue credential. An
 * attacker with an admin's password never has to open our app -- they present
 * the aal1 token straight to an admin edge function.
 *
 * So these assertions are about the server. If they fail, the second factor is
 * decorative again.
 */

import { assert, assertEquals, assertFalse } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  hasVerifiedFactor,
  mfaAssuranceSatisfied,
  readAalClaim,
} from '../_shared/mfaAssurance.ts';

const REPO = new URL('../../../', import.meta.url);

/** A JWT with the given claims. Signature is irrelevant: nothing here verifies it. */
function tokenWith(claims: Record<string, unknown>): string {
  const b64url = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(claims)}.signature`;
}

const enrolled = { factors: [{ status: 'verified' }] };
const enrolling = { factors: [{ status: 'unverified' }] };
const noFactors = { factors: [] };

Deno.test('readAalClaim decodes the level, including base64url payloads', () => {
  assertEquals(readAalClaim(tokenWith({ aal: 'aal1', sub: 'u1' })), 'aal1');
  assertEquals(readAalClaim(tokenWith({ aal: 'aal2', sub: 'u1' })), 'aal2');
  // A payload long enough to need padding, and containing url-safe characters.
  const padded = tokenWith({ aal: 'aal2', sub: 'user-with-a-deliberately-long-identifier-000' });
  assertEquals(readAalClaim(padded), 'aal2');
});

Deno.test('a malformed token yields no claim, and is therefore not aal2', () => {
  assertEquals(readAalClaim(''), null);
  assertEquals(readAalClaim('not-a-jwt'), null);
  assertEquals(readAalClaim('a.!!!!.c'), null);
  assertEquals(readAalClaim(tokenWith({ sub: 'u1' })), null, 'no aal claim at all');
  assertFalse(mfaAssuranceSatisfied('not-a-jwt', enrolled));
});

Deno.test('hasVerifiedFactor counts only verified factors', () => {
  assert(hasVerifiedFactor(enrolled));
  assertFalse(hasVerifiedFactor(enrolling), 'a started-but-unfinished enrolment is not a factor');
  assertFalse(hasVerifiedFactor(noFactors));
  assertFalse(hasVerifiedFactor(null));
  assertFalse(hasVerifiedFactor({}), 'GoTrue omits factors entirely for most users');
});

Deno.test('THE ATTACK: a verified factor plus an aal1 token is refused', () => {
  assertFalse(
    mfaAssuranceSatisfied(tokenWith({ aal: 'aal1' }), enrolled),
    'this is exactly what someone holding the password has',
  );
  assert(mfaAssuranceSatisfied(tokenWith({ aal: 'aal2' }), enrolled));
});

Deno.test('a user with no verified factor is never blocked', () => {
  // The other half of the fix: this must not become a lockout for the 99% of
  // accounts that never enrolled anything.
  for (const user of [noFactors, enrolling, null, undefined, {}]) {
    assert(mfaAssuranceSatisfied(tokenWith({ aal: 'aal1' }), user));
    assert(mfaAssuranceSatisfied(null, user), 'even with no token at all');
    assert(mfaAssuranceSatisfied('garbage', user));
  }
});

Deno.test('securityMiddleware refuses an elevated call from an unsatisfied session', async () => {
  const src = await Deno.readTextFile(
    new URL('supabase/functions/_shared/securityLayers.ts', REPO),
  );
  assert(/mfaSatisfied: boolean/.test(src), 'the context must carry the verdict');
  assert(
    /mfaSatisfied: mfaAssuranceSatisfied\(token, user\)/.test(src),
    'the authenticated branch must compute it from the presented token',
  );
  assert(/errorCode: 'MFA_REQUIRED'/.test(src), 'the refusal must be its own error code');

  // The gate has to sit AHEAD of the role checks, or an admin-enrolled caller
  // is refused with INSUFFICIENT_ROLE and the real reason never reaches a log.
  const gate = src.indexOf('!context.mfaSatisfied');
  const roleCheck = src.indexOf('if (options.minRoleLevel !== undefined) {');
  assert(gate > 0 && roleCheck > gate, 'the assurance check must precede the role checks');

  // Scoped to elevated calls: gating every authenticated request on aal2 would
  // lock an MFA-enrolled ordinary user out of their own profile.
  assert(
    /const wantsElevatedRole =/.test(src),
    'the gate must apply to elevated calls only',
  );
  assert(
    /options\.minRole !== 'user'/.test(src),
    'a plain requireAuth call must not demand a second factor',
  );
});

Deno.test('the browser gate is present too, and is documented as insufficient', async () => {
  const ctx = await Deno.readTextFile(new URL('src/contexts/AuthContext.tsx', REPO));
  assert(
    /isAuthenticated: !!session && !mfaPending/.test(ctx),
    'an aal1 session with a pending factor must not read as signed in',
  );
  assert(
    /getAuthenticatorAssuranceLevel\(\)/.test(ctx),
    'the verdict must come from the assurance level, not from a login-only branch',
  );

  const auth = await Deno.readTextFile(new URL('src/pages/Auth.tsx', REPO));
  assert(
    /if \(isAuthenticated && !requiresMFA\)/.test(auth),
    'the redirect must be gated on the second factor',
  );
  assert(
    /const handleMFACancel = async \(\) => \{[\s\S]*?await logout\(\);/.test(auth),
    'cancelling MFA must end the aal1 session, not just close the dialog',
  );
});
