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
  assert(/id="current-password"/.test(panel));
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
  const panel = codeOnly(await read('src/components/auth/AccountCredentials.tsx'));

  const reauth = panel.indexOf('signInWithPassword');
  const update = panel.indexOf('updatePassword(newPassword)');
  assert(reauth > 0, 'the current password must be proven');
  assert(update > 0);
  assert(reauth < update, 're-authentication must come first');
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
  const panel = codeOnly(await read('src/components/auth/AccountCredentials.tsx'));
  assert(/newPassword\.length < 8/.test(panel), 'a length floor');
  assert(/newPassword !== confirmPassword/.test(panel), 'and a confirmation');
  const firstCheck = panel.indexOf('newPassword.length < 8');
  assert(firstCheck < panel.indexOf('signInWithPassword'), 'checked before the network call');
});
