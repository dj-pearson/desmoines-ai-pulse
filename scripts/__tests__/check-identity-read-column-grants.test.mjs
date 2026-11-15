#!/usr/bin/env node
/**
 * check-identity-read-policies.mjs reading column privileges (WEB-SEC-075).
 *
 *   node --test scripts/__tests__/check-identity-read-column-grants.test.mjs
 *
 * ad_rate_card must stay publicly readable (advertisers are quoted from it), so
 * its USING (true) policy stays and updated_by is hidden with column grants
 * instead. The check used to read policies only, so it could not see that, and
 * it could not tell a real column restriction from a column-level REVOKE that
 * Postgres ignores while the table-level grant is still held.
 *
 * Verified separately on local Postgres 16 with the 20260227000000 table and
 * policies, the 20260401000001 cpm column and auth stubs: before, anon read
 * updated_by; after, anon and a signed-in non-admin get 42501 on updated_by
 * and on select=*, the named columns fetchRateCard and AdRateManager use
 * return every row, an invoker calculate_campaign_pricing that names its
 * columns returns the same totals, an admin UPDATE without RETURNING still
 * saves, and service_role still reads updated_by. One that reads SELECT *
 * makes the migration abort in its own transaction. This file executes no SQL.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { anonColumnGrants, computeExposure, migrationIdentityColumns } from '../check-identity-read-policies.mjs';

const DIR = 'supabase/migrations';
const read = (f) => ({ file: f, sql: readFileSync(`${DIR}/${f}`, 'utf8') });
const sql = (file, text) => ({ file, sql: text });
const RATE_CARD = read('20260227000000_campaign_notifications_and_lifecycle.sql');
const FIX = read('20261115000102_ad_rate_card_hide_updated_by.sql');

const TABLE = sql(
  'a.sql',
  'CREATE TABLE prices (id uuid, amount numeric, updated_by uuid REFERENCES auth.users(id));\n' +
    'CREATE POLICY "read prices" ON prices FOR SELECT USING (true);',
);
const exposure = (migrations) => {
  const cols = migrationIdentityColumns(migrations);
  return computeExposure(migrations, new Set(cols.keys()), cols).exposed;
};

test('ad_rate_card: identity column updated_by, exposed by the 20260227000000 policy (control)', () => {
  const cols = migrationIdentityColumns([RATE_CARD]);
  assert.deepEqual([...(cols.get('ad_rate_card') ?? [])], ['updated_by']);
  assert.ok(exposure([RATE_CARD]).has('ad_rate_card'));
});

test('ad_rate_card: the fix migration hides updated_by from anon and keeps the price columns', () => {
  const grants = anonColumnGrants([RATE_CARD, FIX]);
  const readable = grants.get('ad_rate_card');
  assert.ok(readable, 'ad_rate_card should be column-restricted for anon');
  assert.equal(readable.has('updated_by'), false);
  for (const c of ['placement_type', 'base_daily_rate', 'cpm_rate', 'discount_7_day', 'discount_14_day', 'discount_30_day', 'is_active']) {
    assert.ok(readable.has(c), `fetchRateCard reads ${c}`);
  }
  assert.equal(exposure([RATE_CARD, FIX]).has('ad_rate_card'), false);
});

test('the fix migration grants back every column the table has except updated_by', () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort().map(read);
  const created = /CREATE TABLE IF NOT EXISTS ad_rate_card \(([\s\S]*?)\n\);/.exec(RATE_CARD.sql)[1];
  const all = new Set(
    created.split('\n').map((l) => l.trim().split(/\s+/)[0]).filter((c) => /^[a-z_0-9]+$/.test(c) && c !== 'unique'),
  );
  for (const f of files) for (const m of f.sql.matchAll(/ALTER TABLE (?:public\.)?ad_rate_card\s+ADD COLUMN (?:IF NOT EXISTS )?([a-z_0-9]+)/gi)) all.add(m[1]);
  all.delete('updated_by');
  const readable = anonColumnGrants(files).get('ad_rate_card');
  assert.deepEqual([...all].filter((c) => !readable.has(c)), [], 'columns anon can no longer read');
});

test('a column-level REVOKE under the table grant changes nothing (negative control)', () => {
  const m = [TABLE, sql('b.sql', 'REVOKE SELECT (updated_by) ON public.prices FROM anon;')];
  assert.equal(anonColumnGrants(m).has('prices'), false);
  assert.ok(exposure(m).has('prices'));
});

test('a column grant that still includes the identity column stays exposed', () => {
  const m = [TABLE, sql('b.sql', 'REVOKE SELECT ON prices FROM anon, authenticated;\nGRANT SELECT (id, amount, updated_by) ON prices TO anon;')];
  assert.ok(exposure(m).has('prices'));
});

test('a later table-level GRANT, or ALL TABLES IN SCHEMA, reopens the column', () => {
  const hide = sql('b.sql', 'REVOKE SELECT ON prices FROM anon;\nGRANT SELECT (id, amount) ON prices TO anon;');
  assert.equal(exposure([TABLE, hide]).has('prices'), false);
  assert.ok(exposure([TABLE, hide, sql('c.sql', 'GRANT SELECT, INSERT ON TABLE public.prices TO anon;')]).has('prices'));
  assert.ok(exposure([TABLE, hide, sql('c.sql', 'GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;')]).has('prices'));
});

test('grants to other roles, on functions, or in comments do not count', () => {
  const m = [
    TABLE,
    sql('b.sql', 'REVOKE SELECT ON prices FROM authenticated;\n-- REVOKE SELECT ON prices FROM anon;\nREVOKE EXECUTE ON FUNCTION prices(uuid) FROM anon;'),
  ];
  assert.equal(anonColumnGrants(m).has('prices'), false);
  assert.ok(exposure(m).has('prices'));
});

test('DROP TABLE resets a restriction: the recreated table has the default grant', () => {
  const hide = sql('b.sql', 'REVOKE SELECT ON prices FROM anon;\nGRANT SELECT (id) ON prices TO anon;');
  assert.ok(exposure([TABLE, hide, sql('c.sql', 'DROP TABLE prices;'), TABLE]).has('prices'));
});

test('without identity column names a restricted table counts unless anon reads nothing', () => {
  const m = [TABLE, sql('b.sql', 'REVOKE SELECT ON prices FROM anon;\nGRANT SELECT (id, amount) ON prices TO anon;')];
  assert.ok(computeExposure(m, new Set(['prices'])).exposed.has('prices'));
  const none = [TABLE, sql('b.sql', 'REVOKE ALL ON prices FROM anon;')];
  assert.equal(computeExposure(none, new Set(['prices'])).exposed.has('prices'), false);
});
