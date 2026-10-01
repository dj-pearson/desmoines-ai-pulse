/**
 * A user can change their password and their email (WEB-AUTH-012).
 *
 * /profile edited first name, last name and phone. `updateUser({ email })`
 * appeared nowhere in src, and AuthContext.updatePassword existed but nothing
 * called it. MFA management and a session dashboard were both mounted on that
 * tab; the two things every account needs were not. A user whose password had
 * leaked had one route -- sign out, then "forgot password" -- and a user whose
 * email had changed had none.
 */

import { assert, assertFalse } from 'https://deno.land/std@0.208.0/assert/mod.ts';

const REPO = new URL('../../../', import.meta.url);
const read = (rel: string) => Deno.readTextFile(new URL(rel, REPO));
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

Deno.test('both forms exist and are mounted on /profile', async () => {
  const panel = await read('src/components/auth/AccountCredentials.tsx');
  // Account plan WP5 item 1: the current password is no longer typed; an
  // emailed reauthentication code proves the owner instead.
  assert(/id="reauth-code"/.test(panel));
  assert(/id="new-password"/.test(panel));
  assert(/id="new-email"/.test(panel));

  const profile = codeOnly(await read('src/pages/Profile.tsx'));
  assert(/<AccountCredentials \/>/.test(profile), 'the panel must be rendered');
  assert(
    profile.indexOf('<AccountCredentials />') < profile.indexOf('<MFAManagement />'),
    'a compromised password is why someone opens this tab; put it first',
  );
});

Deno.test('changing a password re-authenticates first', async () => {
  // updateUser({ password }) accepts ANY live session, so without this an
  // unlocked laptop or a stolen token is enough to take the account over
  // permanently: the attacker sets a password the owner does not know.
  //
  // Account plan WP5 item 1: the proof is reauthenticate() plus the emailed
  // nonce, spent by updateUser({ password, nonce }). signInWithPassword was the
  // old proof and it swapped an aal2 session for an aal1 one, which the
  // WEB-SEC-026 hold then treated as signed out mid-change.
  const panel = codeOnly(await read('src/components/auth/AccountCredentials.tsx'));

  const reauth = panel.indexOf('supabase.auth.reauthenticate()');
  const update = panel.indexOf('supabase.auth.updateUser({ password: newPassword, nonce })');
  assert(reauth > 0, 'the owner must be proven with a reauthentication code');
  assert(update > 0, 'the nonce must be spent by the password update');
  assert(reauth < update, 're-authentication must come first');
  assertFalse(/signInWithPassword/.test(panel), 'a password sign-in downgrades an aal2 session');
});

Deno.test('changing a password signs out the other sessions', async () => {
  // Changing a password because it may be compromised achieves nothing while
  // the sessions opened with the old one stay valid.
  const panel = codeOnly(await read('src/components/auth/AccountCredentials.tsx'));
  assert(/signOut\(\{ scope: "others" \}\)/.test(panel), 'other devices must be revoked');
  assertFalse(
    /signOut\(\{ scope: "global" \}\)/.test(panel),
    "'others' keeps this tab signed in; 'global' would eject the user from the screen they just used",
  );
});

Deno.test('changing an email goes through AuthContext so an alert is sent', async () => {
  // AC4. The alert reaches the CURRENT address, so the owner hears about an
  // attempt even if they never click anything.
  const panel = codeOnly(await read('src/components/auth/AccountCredentials.tsx'));
  assert(/await updateEmail\(address\)/.test(panel), 'not supabase.auth.updateUser directly');

  const ctx = codeOnly(await read('src/contexts/AuthContext.tsx'));
  const fn = ctx.slice(ctx.indexOf('const updateEmail = useCallback'), ctx.indexOf('const resendVerification'));
  assert(/supabase\.auth\.updateUser\(\{ email: newEmail \}\)/.test(fn));
  assert(/send-security-notification/.test(fn), 'the same alert path updatePassword uses');
  assert(/email_change_requested/.test(fn));
});

Deno.test('the double confirmation is explained before it happens', async () => {
  // Supabase's default sends a link to BOTH addresses and lands the change only
  // when both are clicked. A user who confirms one and stops will otherwise
  // believe the change failed.
  const panel = await read('src/components/auth/AccountCredentials.tsx');
  assert(/current address and at the new one/.test(panel));
  assert(/after both are confirmed/.test(panel));
});

Deno.test('USER_UPDATED is handled, so a confirmed change shows up', async () => {
  // AC3. Already true; pinned because the panel now depends on it.
  const ctx = codeOnly(await read('src/contexts/AuthContext.tsx'));
  const branch = ctx.slice(ctx.indexOf("if (event === 'USER_UPDATED')"));
  assert(/user: session\?\.user \?\? prev\.user/.test(branch.slice(0, 400)));
});

Deno.test('the password rules are checked before anything is sent', async () => {
  // One rule set (account plan WP1 item 9): passwordSchema, not a local floor.
  const panel = codeOnly(await read('src/components/auth/AccountCredentials.tsx'));
  assert(/passwordSchema\.safeParse\(newPassword\)/.test(panel), 'the shared password rules');
  assert(/newPassword !== confirmPassword/.test(panel), 'and a confirmation');
  const firstCheck = panel.indexOf('passwordSchema.safeParse(newPassword)');
  assert(firstCheck < panel.indexOf('supabase.auth.reauthenticate()'), 'checked before the network call');
});
