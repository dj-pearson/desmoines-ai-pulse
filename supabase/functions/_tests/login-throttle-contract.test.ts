/**
 * Login throttle contract (WEB-SEC-027 and WEB-SEC-028).
 *
 * Three throttles guarded sign-in and two of them answered to the attacker:
 *
 *   failed_auth_attempts   INSERT policy WITH CHECK (true). Five anonymous
 *                          PostgREST calls naming a victim disabled that
 *                          address's login AND signup for fifteen minutes.
 *   check-login-attempt    record_failure inserted a row for any address, and
 *                          the email-keyed lock fired at ten from anywhere, so
 *                          ten POSTs locked a chosen victim out. record_success
 *                          deleted every row for an address, so a brute-forcer
 *                          reset their own counter between batches.
 *
 * These are source-level assertions rather than live calls, because the thing
 * that must not come back is a code path, and there is no database here to
 * point a live call at. Each one names the specific line that was the bug.
 */

import { assert, assertFalse } from 'https://deno.land/std@0.208.0/assert/mod.ts';

const REPO = new URL('../../../', import.meta.url);
const read = (rel: string) => Deno.readTextFile(new URL(rel, REPO));

const FN = 'supabase/functions/check-login-attempt/index.ts';
const MIGRATION = 'supabase/migrations/20260902000007_single_login_throttle.sql';

Deno.test('a stranger cannot lock out an address they do not own', async () => {
  const src = await read(FN);

  // The lock must not be reachable by naming an address in the request body.
  assert(
    /const emailLocked = false;/.test(src),
    'the email-keyed lock must not fire: it is the victim-lockout primitive',
  );
  assertFalse(
    /const emailLocked = emailCount >= EMAIL_MAX_ATTEMPTS/.test(src),
    'the old email-keyed lock must be gone, not merely raised',
  );

  // What is left has to key on something the caller cannot choose.
  assert(/cf-connecting-ip/.test(src), 'the surviving key comes from the request headers');
  assert(/const ipLocked = ipCount >= IP_MAX_ATTEMPTS;/.test(src));
  assert(/if \(ipLocked\) \{/.test(src), 'only the IP signal may gate');
});

Deno.test('clearing a lockout requires a session a correct password produced', async () => {
  const src = await read(FN);

  assert(/async function provesLogin\(/.test(src), 'the proof helper must exist');
  assert(
    /supabase\.auth\.getUser\(accessToken\)/.test(src),
    'the token must be verified against GoTrue, not merely parsed',
  );
  assert(
    /String\(data\.user\.email\)\.trim\(\)\.toLowerCase\(\) === email/.test(src),
    'a valid token for a DIFFERENT account must not clear this one',
  );
  assert(
    /const proved = await provesLogin\(supabase, accessToken, normalizedEmail\);/.test(src),
    'record_success must consult it',
  );

  // The unconditional delete is the bug; it must not survive in any form.
  assertFalse(
    /await supabase\.from\('login_attempts'\)\.delete\(\)\.eq\('email', normalizedEmail\);/.test(src),
    'record_success must never clear an address on the caller\'s say-so',
  );
});

Deno.test('an old client is still accepted, and cannot tell it was refused', async () => {
  const src = await read(FN);

  // Backward compatibility: shipped binaries send the old body and read the old
  // shape. Rejecting record_success with a 4xx would break them, and answering
  // differently when proof is missing would tell an attacker what to send.
  assert(
    /\['check', 'record_failure', 'record_success'\]\.includes\(action\)/.test(src),
    'all three actions must still be accepted',
  );
  const successBranch = src.slice(
    src.indexOf("if (action === 'record_success')"),
    src.indexOf("if (action === 'record_failure')"),
  );
  assert(successBranch.length > 0);
  assert(
    /status: 200/.test(successBranch),
    'the proved and unproved paths must both answer 200',
  );
  assertFalse(/status: 4\d\d/.test(successBranch), 'no new 4xx on a path old clients call');
  assert(
    /attemptsRemaining: EMAIL_MAX_ATTEMPTS/.test(successBranch),
    'the response field shipped clients read must keep its shape',
  );
});

Deno.test('the second, anonymous-writable throttle is closed', async () => {
  const sql = await read(MIGRATION);
  assert(
    /DROP POLICY IF EXISTS "System can insert failed auth attempts" ON public\.failed_auth_attempts;/.test(sql),
    'the WITH CHECK (true) insert policy must be dropped',
  );
  assert(
    /TO service_role/.test(sql),
    'only the service role may write it afterwards',
  );
  // The table and the RPC stay: old rows are still read by admin views, and
  // dropping either would be a destructive change in the same release.
  assertFalse(/DROP TABLE/.test(sql));
  assertFalse(/DROP FUNCTION/.test(sql));
});

Deno.test('the browser no longer drives any lockout', async () => {
  const hook = await read('src/hooks/useAuthSecurity.ts');

  assertFalse(
    /supabase\.rpc\('check_auth_rate_limit'/.test(hook),
    'the client must not call the throttle RPC',
  );
  assertFalse(
    /from\('failed_auth_attempts'\)/.test(hook),
    'the client must not write the throttle table',
  );

  // checkRateLimit keeps its signature and its local counter, but the server
  // path it used to block on is gone, so it can no longer report `allowed:
  // false` on anyone else's behalf.
  const fn = hook.slice(hook.indexOf('const checkRateLimit'), hook.indexOf('const checkDisposableEmail'));
  assert(fn.length > 0, 'checkRateLimit must still exist ahead of checkDisposableEmail');
  assert(/SecurityUtils\.checkRateLimit\(/.test(fn), 'the local per-browser counter stays');
});

Deno.test('AuthContext sends the proof it now needs', async () => {
  const ctx = await read('src/contexts/AuthContext.tsx');
  assert(
    /checkServerLockout\(email, 'record_success', data\.session\?\.access_token\)/.test(ctx),
    'the success call must carry the token the server verifies',
  );
  assert(
    /accessToken\?: string,/.test(ctx),
    'checkServerLockout must accept it',
  );
  assert(
    /body: accessToken \? \{ email, action, accessToken \} : \{ email, action \}/.test(ctx),
    'and must not send an accessToken key when there is none',
  );
});
