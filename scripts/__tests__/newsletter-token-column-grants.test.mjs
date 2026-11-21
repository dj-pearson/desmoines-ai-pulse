#!/usr/bin/env node
/**
 * newsletter_subscribers' token columns are hidden by column privileges
 * (WEB-SEC-076, migration 20261115000110).
 *
 *   node --test scripts/__tests__/newsletter-token-column-grants.test.mjs
 *
 * 20260413000002 and 20260918000002 revoked SELECT on unsubscribe_token and
 * confirm_token column by column. Postgres ignores that while the role holds
 * the table-level grant, so an admin session read every reader's tokens and
 * only RLS kept them from anon. 20261115000110 revokes the table grant and
 * grants back every other column.
 *
 * Verified separately on local Postgres 16 with the real 20251126000000,
 * 20260413000002, 20260918000002, 20261002000002, 20261005000003,
 * 20261108000037 and 20261108000083 SQL and auth stubs. Before: an admin read
 * 3 unsubscribe tokens and 1 confirm token, and with an anon USING (true)
 * policy added anon read all 3. After: both are 42501 for anon, a non-admin
 * and an admin, as is select=*; the admin page's named-column load, count,
 * filters and bulk unsubscribe RETURNING id behave as before, as do the
 * unsubscribe and confirm RPCs called as anon and service_role reads. The
 * migration aborts if a PUBLIC grant still exposes a token. This file
 * executes no SQL.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { anonColumnGrants } from '../check-identity-read-policies.mjs';

const DIR = 'supabase/migrations';
const FIX_FILE = '20261115000110_newsletter_tokens_column_grants.sql';
const TOKENS = ['unsubscribe_token', 'confirm_token'];
const read = (f) => ({ file: f, sql: readFileSync(`${DIR}/${f}`, 'utf8') });
const ALL = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort().map(read);
const stripComments = (s) => s.replace(/--[^\n]*/g, '');

function tableColumns() {
  const create = ALL.find((m) => /CREATE TABLE IF NOT EXISTS public\.newsletter_subscribers \(/.test(m.sql));
  assert.ok(create, 'newsletter_subscribers CREATE TABLE not found');
  const body = /CREATE TABLE IF NOT EXISTS public\.newsletter_subscribers \(([\s\S]*?)\n\);/.exec(create.sql)[1];
  const cols = new Set(
    stripComments(body)
      .split('\n')
      .map((l) => l.trim().split(/\s+/)[0])
      .filter((c) => /^[a-z_0-9]+$/.test(c)),
  );
  for (const m of ALL) {
    for (const alter of stripComments(m.sql).matchAll(/ALTER TABLE (?:public\.)?newsletter_subscribers\b([\s\S]*?);/gi)) {
      for (const add of alter[1].matchAll(/ADD COLUMN (?:IF NOT EXISTS )?([a-z_0-9]+)/gi)) cols.add(add[1]);
    }
  }
  return cols;
}

test('the table has both token columns (control)', () => {
  const cols = tableColumns();
  for (const t of TOKENS) assert.ok(cols.has(t), `${t} should exist`);
  assert.ok(cols.has('email') && cols.has('confirmed_at'));
});

test('before the fix, the column-level REVOKEs leave anon with the table grant', () => {
  const upTo = ALL.filter((m) => m.file < FIX_FILE);
  assert.equal(anonColumnGrants(upTo).has('newsletter_subscribers'), false);
});

test('after all migrations anon cannot read either token', () => {
  const readable = anonColumnGrants(ALL).get('newsletter_subscribers');
  assert.ok(readable, 'newsletter_subscribers should be column-restricted for anon');
  for (const t of TOKENS) assert.equal(readable.has(t), false, `${t} is readable`);
});

test('every non-token column is granted back (a new column must be added to the GRANT)', () => {
  const readable = anonColumnGrants(ALL).get('newsletter_subscribers');
  const missing = [...tableColumns()].filter((c) => !TOKENS.includes(c) && !readable.has(c));
  assert.deepEqual(missing, [], 'columns anon and authenticated can no longer read; grant them or list them as secret here');
});

test('the admin page names only granted columns and never select("*")', () => {
  const src = readFileSync('src/components/admin/NewsletterSubscribersManager.tsx', 'utf8');
  const readable = anonColumnGrants(ALL).get('newsletter_subscribers');
  const selects = [...src.matchAll(/\.select\(\s*"([^"]*)"/g)].map((m) => m[1]);
  assert.ok(selects.length >= 3, 'expected load, export and the update RETURNING');
  for (const s of selects) {
    for (const col of s.split(',').map((c) => c.trim())) {
      assert.notEqual(col, '*', 'select("*") is refused with 42501 under the column grant');
      assert.ok(readable.has(col), `${col} is not granted`);
    }
  }
});

test('the fix revokes the table grant from both roles and grants to both', () => {
  const fix = stripComments(read(FIX_FILE).sql);
  assert.match(fix, /REVOKE SELECT ON public\.newsletter_subscribers FROM anon, authenticated;/);
  const grant = /GRANT SELECT \(([\s\S]*?)\) ON public\.newsletter_subscribers TO anon, authenticated;/.exec(fix);
  assert.ok(grant, 'column GRANT to anon, authenticated not found');
  for (const t of TOKENS) assert.equal(grant[1].includes(t), false);
});
