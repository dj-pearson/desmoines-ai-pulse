/**
 * No credential literal survives in the tree (WEB-SEC-032).
 *
 * A service_role JWT was written as a literal into eleven 2025 migrations, and
 * an anon key into four scripts and two docs. All fifteen were ALLOWLISTED in
 * .gitleaks.toml -- the scanner was configured not to look at exactly the files
 * that had the problem, and an allowlist that grows is a scanner that reports
 * less every quarter.
 *
 * The sharper half is that nobody had noticed where else the key was. The
 * migrations wrote it inside CREATE OR REPLACE FUNCTION bodies and no later
 * migration replaced any of them, so the value sat in the DATABASE, readable
 * through pg_get_functiondef by anyone who could connect.
 *
 * Rotation is separate and is the owner's: the value is in git history and
 * always will be.
 */

import { assert, assertEquals, assertFalse } from 'https://deno.land/std@0.208.0/assert/mod.ts';

const REPO = new URL('../../../', import.meta.url);
const read = (rel: string) => Deno.readTextFile(new URL(rel, REPO));

/** A JWT shape, not a value: three base64url segments starting with the `eyJ` header. */
const JWT = /eyJ[A-Za-z0-9_.-]{30,}\.[A-Za-z0-9_.-]{20,}/;

/** Directories worth scanning. node_modules and .git are not ours. */
const SCAN_DIRS = ['supabase/migrations', 'scripts', 'docs'];

async function* walk(dir: string): AsyncGenerator<string> {
  let entries: Deno.DirEntry[] = [];
  try {
    for await (const e of Deno.readDir(new URL(dir + '/', REPO))) entries.push(e);
  } catch {
    return;
  }
  entries = entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entries) {
    const path = `${dir}/${e.name}`;
    if (e.isDirectory) {
      yield* walk(path);
    } else if (/\.(sql|ts|js|cjs|mjs|md|html)$/.test(e.name)) {
      yield path;
    }
  }
}

Deno.test('no JWT literal remains under migrations, scripts or docs', async () => {
  const offenders: string[] = [];
  for (const dir of SCAN_DIRS) {
    for await (const rel of walk(dir)) {
      const src = await read(rel);
      if (JWT.test(src)) offenders.push(rel);
    }
  }
  assertEquals(offenders, [], `credential literals still in the tree: ${offenders.join(', ')}`);
});

Deno.test('the eleven migrations read the key from Vault instead', async () => {
  const files = [
    '20250820173146_92b9d303-bf93-4ffc-93ac-dc3078655835',
    '20250822015522_35c771c4-fd31-4b5f-bb86-889bb9cea00d',
    '20250823012338_f22cb5f1-a713-4a8b-903e-f1a2238b9bb0',
    '20250825174423_f58a2edf-ec5b-4e1c-b697-0b0f35f750d9',
    '20250830035320_8fe52259-d714-4811-bfda-251e217c9de1',
    '20250830035336_d375aceb-4bb3-48b1-970a-373580dfc1e6',
    '20250830144003_3af494dc-d454-44d8-9ee6-bf68b42f5c43',
    '20250831045616_17aa4faf-06ae-4aba-86fe-fd0cc940bd29',
    '20250903031613_fc6954fd-fc9d-44c8-8c06-7d13bbbb4f8d',
    '20250903140840_3c9fa09a-0449-4e7e-9794-88f0bc6e419f',
    '20251004030356_80f20bea-45bd-4bdb-bc40-afb764fc01c6',
  ];
  for (const name of files) {
    const src = await read(`supabase/migrations/${name}.sql`);
    assert(
      src.includes("public.app_secret('service_role_key')"),
      `${name} must read the key from Vault`,
    );
    // And it must say why it was edited, because editing applied history looks
    // wrong until you know the reason.
    assert(src.includes('WEB-SEC-032'), `${name} must carry the reason for the edit`);
  }
});

Deno.test('a migration removes the key from the live database', async () => {
  // The half that a tree-only fix misses entirely.
  const sql = await read('supabase/migrations/20260902000015_purge_embedded_service_key.sql');

  assert(/pg_get_functiondef/.test(sql), 'it must read what is actually installed');
  assert(/EXECUTE newdef;/.test(sql), 'and re-execute the rewritten definition');
  assertFalse(JWT.test(sql), 'the migration itself must contain no credential');

  // It has to handle BOTH shapes the key was written in.
  assert(/'''Bearer eyJ/.test(sql), "the 'Bearer <jwt>' header shape");
  assert(/service_key := /.test(sql) || /'''eyJ/.test(sql), 'the assignment shape');

  // And it must not pass silently if a shape was missed.
  assert(/REMAINS in at least one public function/.test(sql));
});

Deno.test('the missing-Vault-secret case is called out at apply time', async () => {
  // app_secret() returns NULL when unset, 'Bearer ' || NULL is NULL,
  // jsonb_build_object DROPS the key, and the POST goes out unauthenticated --
  // while pg_cron records SUCCESS, because enqueueing worked.
  const sql = await read('supabase/migrations/20260902000015_purge_embedded_service_key.sql');
  assert(/app_secret\('service_role_key'\) IS NULL/.test(sql));
  assert(/pg_cron will still record SUCCESS/.test(sql));
});

Deno.test('the gitleaks allowlist no longer covers the files that had the problem', async () => {
  const toml = await read('.gitleaks.toml');
  for (const stamp of ['20250820173146', '20250903140840', '20251004030356']) {
    assertFalse(toml.includes(stamp), `${stamp} must not be allowlisted any more`);
  }
  for (const script of ['debug-browser', 'debug-catchdesmoines', 'invoke-populate-playgrounds', 'event-datetime-sql-generator']) {
    assertFalse(
      new RegExp(`'''[^']*${script}`).test(toml),
      `${script} must not be allowlisted any more`,
    );
  }
  assert(toml.includes('WEB-SEC-032'), 'and the removal must say why');
});

Deno.test('the debug scripts read their key from the environment and refuse without it', async () => {
  // "Bearer undefined" is a worse failure than a clear one, because it looks
  // like an auth problem on the server.
  for (const rel of [
    'scripts/debug-browser.js',
    'scripts/debug-catchdesmoines.js',
    'scripts/event-datetime-sql-generator.ts',
  ]) {
    const src = await read(rel);
    assert(/process\.env\.VITE_SUPABASE_ANON_KEY/.test(src), `${rel} must read from env`);
    assert(/is not set/.test(src), `${rel} must fail fast when it is absent`);
  }
});

Deno.test('the rotation runbook records what was done and what is still owed', async () => {
  const doc = await read('docs/SECRETS_ROTATION.md');
  assert(/WEB-SEC-032/.test(doc));
  assert(/Rotation date/.test(doc), 'the one thing only the owner can do must be tracked');
  assert(/pg_get_functiondef/.test(doc), 'including that the key was in the database, not just git');
});
