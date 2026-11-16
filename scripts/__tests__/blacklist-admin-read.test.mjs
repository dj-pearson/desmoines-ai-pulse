#!/usr/bin/env node
/**
 * The place blacklists are admin-read only, and their two edge readers still
 * see them (WEB-SEC-074).
 *
 *   node --test scripts/__tests__/blacklist-admin-read.test.mjs
 *
 * Migration 20261115000042 drops the USING (true) reads on restaurant_blacklist
 * and hotel_blacklist. check-identity-reads guards that side. This guards the
 * other: search-new-restaurants and search-new-hotels used to read the
 * blacklist with the anon key, which after the migration returns zero rows
 * without an error, and their error branch is "continue without filtering". A
 * regression would show blocked places in admin search again and fail nothing,
 * so the read must go through a client built with the service role key.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const READERS = [
  { fn: 'search-new-restaurants', table: 'restaurant_blacklist' },
  { fn: 'search-new-hotels', table: 'hotel_blacklist' },
];

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Name of the client variable the `.from("<table>")` call chains off. */
export function clientForTable(src, table) {
  const m = new RegExp(`await\\s+(\\w+)\\s*\\.from\\(\\s*["']${table}["']`).exec(src);
  return m ? m[1] : null;
}

/** The env var holding the key passed to createClient for that variable. */
export function keyForClient(src, client) {
  const decl = new RegExp(`const\\s+${client}\\s*=\\s*createClient\\(([\\s\\S]*?)\\);`).exec(src);
  if (!decl) return null;
  const args = decl[1];
  const direct = /env\??\.get\(\s*["'](\w+)["']\s*\)/g;
  const keys = [...args.matchAll(direct)].map((x) => x[1]);
  if (keys.length) return keys[keys.length - 1];
  // createClient(url, someKeyVar): follow the variable once.
  const second = args.split(',')[1]?.trim();
  if (!second) return null;
  const v = new RegExp(`const\\s+${second}\\s*=[^;]*env\\??\\.get\\(\\s*["'](\\w+)["']`).exec(src);
  return v ? v[1] : null;
}

for (const { fn, table } of READERS) {
  test(`${fn} reads ${table} with the service role`, () => {
    const src = stripComments(readFileSync(`supabase/functions/${fn}/index.ts`, 'utf8'));
    const client = clientForTable(src, table);
    assert.ok(client, `${fn} no longer reads ${table}; update this test`);
    assert.equal(keyForClient(src, client), 'SUPABASE_SERVICE_ROLE_KEY');
  });

  test(`${fn} still refuses callers before the service-role read`, () => {
    const src = stripComments(readFileSync(`supabase/functions/${fn}/index.ts`, 'utf8'));
    const gate = src.indexOf('requireAdminOrApiKey(req');
    const read = src.indexOf(`.from("${table}")`);
    assert.ok(gate > 0 && read > gate, 'the admin/API-key gate must run before the blacklist read');
  });
}

test('the helpers see an anon-key reader as anon (control)', () => {
  const src = `
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data } = await supabase
      .from("hotel_blacklist")
      .select("google_place_id");`;
  const client = clientForTable(src, 'hotel_blacklist');
  assert.equal(client, 'supabase');
  assert.equal(keyForClient(src, client), 'SUPABASE_ANON_KEY');
});
