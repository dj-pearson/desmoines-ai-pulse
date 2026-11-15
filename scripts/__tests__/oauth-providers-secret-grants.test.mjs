#!/usr/bin/env node
/**
 * oauth_providers.client_secret is write-only for admins (WEB-SEC-079,
 * migration 20261115000150).
 *
 *   node --test scripts/__tests__/oauth-providers-secret-grants.test.mjs
 *
 * 20251107000000 granted table-level SELECT on oauth_providers to
 * authenticated (anon holds it through Supabase's default privileges), so the
 * admin policy was all that stood in front of client_secret, and the admin
 * page's generic connect branch read it with select('*'). The fix revokes the
 * table grant and grants back every other column to authenticated.
 *
 * Verified separately on local Postgres 16 with the real 20251107000000,
 * 20260511000000 (oauth_providers policy) and 20260517000000 SQL and auth
 * stubs. Before: an admin read every client_secret, select * returned 4 rows.
 * After: client_secret and select * are 42501 for anon, a non-admin and an
 * admin; the admin's named-column read, the Save Credentials UPDATE (no
 * RETURNING) and refresh_oauth_token (SECURITY DEFINER) work as before;
 * service_role still reads the secret; re-running is a no-op; and the
 * migration aborts if a PUBLIC grant still exposes the column. This file
 * executes no SQL.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'supabase/migrations';
const FIX_FILE = '20261115000150_oauth_providers_hide_client_secret.sql';
const SECRET = 'client_secret';
const ROLES = ['anon', 'authenticated'];
const TABLE = String.raw`(?:public\.)?oauth_providers`;
const stripComments = (s) => s.replace(/--[^\n]*/g, '');
const read = (f) => ({ file: f, sql: stripComments(readFileSync(`${DIR}/${f}`, 'utf8')) });
const ALL = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort().map(read);

function tableColumns() {
  const create = ALL.find((m) => new RegExp(String.raw`CREATE TABLE IF NOT EXISTS ${TABLE} \(`).test(m.sql));
  assert.ok(create, 'oauth_providers CREATE TABLE not found');
  const body = new RegExp(String.raw`CREATE TABLE IF NOT EXISTS ${TABLE} \(([\s\S]*?)\n\);`).exec(create.sql)[1];
  const cols = new Set(body.split('\n').map((l) => l.trim().split(/\s+/)[0]).filter((c) => /^[a-z_0-9]+$/.test(c)));
  for (const m of ALL) {
    for (const alter of m.sql.matchAll(new RegExp(String.raw`ALTER TABLE ${TABLE}\b([\s\S]*?);`, 'gi'))) {
      for (const add of alter[1].matchAll(/ADD COLUMN (?:IF NOT EXISTS )?([a-z_0-9]+)/gi)) cols.add(add[1]);
    }
  }
  return cols;
}

/**
 * Replays SELECT grants on oauth_providers for each role. A role starts with
 * the table grant (Supabase default privileges). 'ALL' means the table grant;
 * a Set means column grants only. A column REVOKE under the table grant is a
 * no-op, as in Postgres.
 */
function selectGrants(migrations) {
  const state = Object.fromEntries(ROLES.map((r) => [r, 'ALL']));
  const roleList = (s) => s.split(',').map((r) => r.trim().toLowerCase());
  const stmt = new RegExp(
    String.raw`\b(GRANT|REVOKE)\s+(SELECT|ALL(?:\s+PRIVILEGES)?)\s*(\(([^)]*)\))?\s+ON\s+(?:TABLE\s+)?${TABLE}\s+(?:TO|FROM)\s+([a-z_,\s]+?)\s*;`,
    'gi',
  );
  for (const { sql } of migrations) {
    for (const m of sql.matchAll(stmt)) {
      const [, verb, , , cols, roles] = m;
      const colList = cols ? cols.split(',').map((c) => c.trim()) : null;
      for (const role of roleList(roles)) {
        if (!(role in state)) continue;
        if (verb.toUpperCase() === 'GRANT') {
          if (!colList) state[role] = 'ALL';
          else if (state[role] !== 'ALL') colList.forEach((c) => state[role].add(c));
        } else if (!colList) {
          state[role] = new Set();
        } else if (state[role] !== 'ALL') {
          colList.forEach((c) => state[role].delete(c));
        }
      }
    }
  }
  return state;
}

const canRead = (grant, col) => grant === 'ALL' || grant.has(col);

test('the table has client_secret and client_id (control)', () => {
  const cols = tableColumns();
  assert.ok(cols.has(SECRET));
  assert.ok(cols.has('client_id') && cols.has('provider_name'));
});

test('before the fix, both roles hold the table grant and so can read client_secret', () => {
  const state = selectGrants(ALL.filter((m) => m.file < FIX_FILE));
  for (const r of ROLES) assert.ok(canRead(state[r], SECRET), `${r} should read it before the fix`);
});

test('after all migrations neither anon nor authenticated can read client_secret', () => {
  const state = selectGrants(ALL);
  for (const r of ROLES) assert.equal(canRead(state[r], SECRET), false, `${r} can read client_secret`);
});

test('authenticated keeps every other column (a new column must be added to the GRANT)', () => {
  const state = selectGrants(ALL);
  const missing = [...tableColumns()].filter((c) => c !== SECRET && !canRead(state.authenticated, c));
  assert.deepEqual(missing, []);
});

function srcFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === '__tests__' ? [] : srcFiles(p);
    return /\.(ts|tsx)$/.test(name) && !p.endsWith('integrations/supabase/types.ts') ? [p] : [];
  });
}

test('no web query on oauth_providers selects * or client_secret', () => {
  const granted = selectGrants(ALL).authenticated;
  let chains = 0;
  for (const file of srcFiles('src')) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/\.from\(\s*["'`]oauth_providers["'`]\s*\)/g)) {
      chains++;
      const chain = src.slice(m.index, src.indexOf(';', m.index));
      for (const sel of chain.matchAll(/\.select\(\s*(?:["'`]([^"'`]*)["'`])?/g)) {
        const cols = (sel[1] ?? '*').split(',').map((c) => c.trim());
        for (const col of cols) {
          assert.notEqual(col, '*', `${file}: select('*') on oauth_providers is refused with 42501`);
          assert.ok(canRead(granted, col), `${file}: ${col} is not granted`);
        }
      }
    }
  }
  assert.ok(chains >= 1, 'expected the Save Credentials update in OAuthProviderSetup');
});

test('the setup page has no client-built authorize URL for non-GSC providers', () => {
  const src = readFileSync('src/components/admin/SearchTrafficDashboard/OAuthProviderSetup.tsx', 'utf8');
  assert.equal(/authorization_url/.test(src), false, 'generic OAuth branch is back');
  const connectable = [...src.matchAll(/provider_name: "([a-z_]+)"[\s\S]*?connectable: (true|false)/g)];
  assert.equal(connectable.length, 4);
  assert.deepEqual(connectable.filter((c) => c[2] === 'true').map((c) => c[1]), ['google_search_console']);
});
