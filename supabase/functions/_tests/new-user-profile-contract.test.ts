/**
 * Signup metadata reaches the profile (WEB-AUTH-002).
 *
 * Auth.tsx collects phone, location, interests and communication preferences
 * and puts them in raw_user_meta_data. Nothing moved them anywhere. The profile
 * row was created lazily by useProfile with four columns, so every other column
 * stayed NULL for every account ever created -- which is also why WEB-LEGAL-012
 * reads as "the marketing opt-out is written by no client": the nurture agents
 * read a column no writer populated.
 */

import { assert, assertFalse } from 'https://deno.land/std@0.208.0/assert/mod.ts';

const REPO = new URL('../../../', import.meta.url);
const read = (rel: string) => Deno.readTextFile(new URL(rel, REPO));

const MIGRATION = 'supabase/migrations/20260902000011_handle_new_user_profile.sql';

Deno.test('the trigger exists and fires on every new auth user', async () => {
  const sql = await read(MIGRATION);
  assert(/CREATE OR REPLACE FUNCTION public\.handle_new_user\(\)/.test(sql));
  assert(
    /CREATE TRIGGER on_auth_user_created\s*\n\s*AFTER INSERT ON auth\.users/.test(sql),
    'it must fire after the auth user is created',
  );
  assert(/SECURITY DEFINER/.test(sql), 'it writes public.profiles from the auth schema');
  assert(/SET search_path = public/.test(sql), 'pinned, which is the mitigation for the schema-context objection');
});

Deno.test('it can never block a signup', async () => {
  const sql = await read(MIGRATION);
  const fn = sql.match(/CREATE OR REPLACE FUNCTION public\.handle_new_user\(\)[\s\S]*?\n\$\$;/);
  assert(fn, 'the function must exist');
  const body = fn[0];

  // A trigger on auth.users that raises takes registration down for everyone.
  assert(
    /EXCEPTION WHEN OTHERS THEN[\s\S]*RAISE WARNING[\s\S]*RETURN NEW;/.test(body),
    'every failure must warn and return NEW',
  );
  assertFalse(
    /RAISE EXCEPTION/.test(body),
    'nothing in this function may raise: a failed profile is not worth a failed signup',
  );
});

Deno.test('every field the signup form collects is carried across', async () => {
  const sql = await read(MIGRATION);
  const auth = await read('src/pages/Auth.tsx');

  // The columns the form fills that used to be dropped.
  for (const field of ['first_name', 'last_name', 'phone', 'location', 'interests', 'communication_preferences']) {
    assert(
      new RegExp(`'${field}'|\\b${field}\\b`).test(sql),
      `${field} must be copied out of raw_user_meta_data`,
    );
    assert(new RegExp(`${field}`).test(auth), `${field} should still be collected at signup`);
  }

  // interests is text[] and arrives as a JSON array; a non-array must not raise.
  assert(
    /jsonb_typeof\(meta->'interests'\) = 'array'/.test(sql),
    'interests must be shape-checked before conversion',
  );
  assert(
    /jsonb_typeof\(meta->'communication_preferences'\) = 'object'/.test(sql),
    'and so must the preferences bag',
  );
});

Deno.test('an existing value always beats one from metadata', async () => {
  const sql = await read(MIGRATION);
  // The conflict path must never clobber an edit the user made in their
  // settings with a stale value captured at signup.
  assert(/ON CONFLICT \(user_id\) DO UPDATE/.test(sql));
  for (const col of ['first_name', 'phone', 'location', 'interests', 'communication_preferences']) {
    assert(
      new RegExp(`${col} =\\s*COALESCE\\(public\\.profiles\\.${col}, EXCLUDED\\.${col}\\)`).test(sql),
      `${col} must prefer the stored value`,
    );
  }
});

Deno.test('upserting on user_id is only safe once it is unique', async () => {
  const sql = await read(MIGRATION);
  assert(
    /CREATE UNIQUE INDEX IF NOT EXISTS profiles_user_id_key/.test(sql),
    'no migration declared this, and ON CONFLICT (user_id) needs it',
  );
  // Duplicates must be reported as such rather than surfacing as a raw
  // constraint violation during a deploy.
  assert(
    /have more than one profile row/.test(sql),
    'a pre-existing duplicate must be named for the operator',
  );
  const check = sql.indexOf('HAVING count(*) > 1');
  const create = sql.indexOf('CREATE UNIQUE INDEX IF NOT EXISTS profiles_user_id_key');
  assert(check > 0 && create > check, 'the duplicate check must run first');
});

Deno.test('accounts created before the trigger are backfilled, non-destructively', async () => {
  const sql = await read(MIGRATION);
  assert(/FROM auth\.users u/.test(sql), 'the backfill reads the auth table');
  assert(/WHERE NOT EXISTS \(SELECT 1 FROM public\.profiles p WHERE p\.user_id = u\.id\)/.test(sql),
    'users with no profile row at all must get one');
  assert(/RAISE NOTICE 'WEB-AUTH-002 backfill/.test(sql), 'the counts must be reported');
  // Same rule as the trigger: fill blanks, never overwrite.
  assert(/SET phone = COALESCE\(p\.phone,/.test(sql));
});

Deno.test('the client fallback no longer races itself', async () => {
  const hook = await read('src/hooks/useProfile.ts');
  assert(
    /onConflict: "user_id", ignoreDuplicates: true/.test(hook),
    'two mounts on first login both saw no row and both inserted',
  );
  assertFalse(
    /\.from\("profiles"\)\s*\n\s*\.insert\(\{\s*\n\s*user_id: user\.id,/.test(hook),
    'the plain insert that produced a duplicate-key error must be gone',
  );
  // ignoreDuplicates returns nothing to the loser, so the row has to be re-read.
  assert(
    /const \{ data: newProfile \} = await supabase\s*\n\s*\.from\("profiles"\)\s*\n\s*\.select\("\*"\)/.test(hook),
    'the profile must be read back rather than taken from the write',
  );
});

Deno.test('the profile page can now edit what signup promised', async () => {
  const page = await read('src/pages/Profile.tsx');
  assert(/<PreferencesManager \/>/.test(page), 'the panel that writes communication_preferences must be mounted');
  assert(/import PreferencesManager from "@\/components\/PreferencesManager"/.test(page));

  // The panel that was already there does not touch that column, which is why
  // the promise was unmet even though a preferences screen existed.
  const settings = await read('src/components/PreferencesSettings.tsx');
  assertFalse(
    /communication_preferences/.test(settings),
    'if PreferencesSettings gains that column, revisit which panel owns it',
  );
  const manager = await read('src/components/PreferencesManager.tsx');
  assert(/communication_preferences/.test(manager));
});
