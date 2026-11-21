/**
 * The idle-logout policy applies to the sessions it was written for
 * (WEB-AUTH-007).
 *
 * SessionManager mounted for EVERYONE with a 30-minute idle timeout and an
 * 8-hour cap, on an events site, and the timeout called
 * signOut({ scope: 'global' }). So someone browsing restaurants over lunch,
 * leaving the tab and coming back after a meeting was signed out -- and signed
 * out of their phone as well, by a desktop tab that had done nothing.
 *
 * Source assertions, because the three things that must hold are the shape of
 * the code: who the policy applies to, which scope a timeout uses, and where
 * the session age is measured from. The measurement itself is exercised in
 * src/lib/__tests__/sessionAge.test.ts.
 */

import { assert, assertFalse } from 'jsr:@std/assert@1';

const REPO = new URL('../../../', import.meta.url);
const read = (rel: string) => Deno.readTextFile(new URL(rel, REPO));

/** Strip comments: these files explain the OLD behaviour in prose. */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

Deno.test('a timeout signs out locally, not everywhere', async () => {
  const hook = codeOnly(await read('src/hooks/useSessionTimeout.ts'));

  // Both exits: the idle timeout and the maximum-duration cap.
  const localLogouts = hook.match(/logout\(\{ scope: 'local' \}\)/g) || [];
  assert(localLogouts.length >= 2, `both timeout paths must be local, found ${localLogouts.length}`);
  assertFalse(
    /logout\(\)\s*;/.test(hook),
    'no timeout path may fall through to the default global scope',
  );
});

Deno.test('a deliberate logout still revokes every device', async () => {
  // The scope is a parameter with a global default, so pressing Log Out is
  // unchanged. Narrowing that too would be a real security regression.
  const ctx = codeOnly(await read('src/contexts/AuthContext.tsx'));
  assert(/options\?\.scope \?\? 'global'/.test(ctx), 'global must remain the default');
  assert(
    /logout: \(options\?: \{ scope\?: 'local' \| 'global' \} \) => Promise<void>;/.test(ctx) ||
      /logout: \(options\?: \{ scope\?: 'local' \| 'global' \}\) => Promise<void>;/.test(ctx),
    'the option must be on the published type',
  );
});

Deno.test('the idle policy is scoped to admins', async () => {
  // WEB-PERF-061 moved the hook behind a lazy boundary: SessionManager no longer
  // passes `enabled: isAdmin && !isAdminLoading`, it returns null for everyone
  // else and mounts AdminSessionTimeout, which calls the hook with
  // `enabled: true`. The gate is now the early return, so that is what is
  // asserted. This test kept matching the old `enabled:` expression and failed
  // from that commit on, which also skipped every later step in its CI job.
  const mgr = codeOnly(await read('src/components/auth/SessionManager.tsx'));
  assert(
    /if \(!isAdmin \|\| isAdminLoading\) return null;/.test(mgr),
    'admins only, and not mid-check: SessionManager must return null before the admin check resolves true',
  );
  assert(/<AdminSessionTimeout\s*\/>/.test(mgr), 'the admin policy is mounted from SessionManager');
  assertFalse(/useSessionTimeout\(/.test(mgr), 'the hook must not run ungated in SessionManager');

  // AdminSessionTimeout hard-codes `enabled: true`, which is only safe while
  // SessionManager is its one mount point. Any other importer would apply the
  // 30-minute timeout to whoever renders it.
  const importers: string[] = [];
  async function walk(dir: URL): Promise<void> {
    for await (const entry of Deno.readDir(dir)) {
      const child = new URL(`${entry.name}${entry.isDirectory ? '/' : ''}`, dir);
      if (entry.isDirectory) {
        if (entry.name !== '__tests__') await walk(child);
      } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        const src = codeOnly(await Deno.readTextFile(child));
        if (/['"][^'"]*\/AdminSessionTimeout['"]/.test(src)) importers.push(child.pathname.split('/src/')[1]);
      }
    }
  }
  await walk(new URL('src/', REPO));
  assert(
    importers.length === 1 && importers[0] === 'components/auth/SessionManager.tsx',
    `AdminSessionTimeout must be loaded only by SessionManager, found: ${importers.join(', ')}`,
  );
});

Deno.test('session age comes from the session, not from page load', async () => {
  const hook = codeOnly(await read('src/hooks/useSessionTimeout.ts'));
  assert(
    /const startedAt = getSessionStartedAt\(\) \?\? sessionStartRef\.current;/.test(hook),
    'the cap must measure from the session, with mount time only as a last resort',
  );
  assertFalse(
    /const sessionDuration = Date\.now\(\) - sessionStartRef\.current;/.test(hook),
    'the page-load measurement must be gone',
  );
});

Deno.test('the session start does not move on a token refresh', async () => {
  // Reading `iat` would reset the cap every hour, because Supabase refreshes
  // hourly -- an 8-hour maximum would then be unreachable.
  const lib = await read('src/lib/sessionAge.ts');
  assert(/session\.user\?\.last_sign_in_at/.test(lib), 'last_sign_in_at is the stable source');
  assert(/iat/.test(lib), 'iat stays as a fallback for a session with no user object');

  const codeOnlyLib = codeOnly(lib);
  assert(
    /return null;/.test(codeOnlyLib),
    'an unknown start must be reported as null, not papered over with now()',
  );
});

Deno.test('the dead session pair is gone', async () => {
  // src/components/SessionTimeoutWarning.tsx and src/hooks/useSessionManager.ts
  // imported only each other and nothing else imported either. The live pair is
  // components/auth/SessionTimeoutWarning.tsx + hooks/useSessionTimeout.ts.
  for (const rel of ['src/components/SessionTimeoutWarning.tsx', 'src/hooks/useSessionManager.ts']) {
    let exists = true;
    try {
      await read(rel);
    } catch {
      exists = false;
    }
    assertFalse(exists, `${rel} should have been deleted`);
  }

  // And the live pair is still there.
  await read('src/components/auth/SessionTimeoutWarning.tsx');
  await read('src/hooks/useSessionTimeout.ts');
});
