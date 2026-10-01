#!/usr/bin/env node
/**
 * check-upsert-update-policy.mjs (Plan & Stay pass 2, WP5 item 11).
 *
 *   node --test scripts/__tests__/check-upsert-update-policy.test.mjs
 *
 * The case that matters is the first one: votes as it stood before
 * 20260829000001 / 20260925000001, with INSERT, SELECT and DELETE policies and
 * an upsert from the browser. That shape passed every test that votes once.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  replayPolicies,
  allowsUpdate,
  findUpserts,
  run,
} from '../check-upsert-update-policy.mjs';

const VOTES_2026_02 = `
CREATE TABLE IF NOT EXISTS votes (id uuid primary key, category_id uuid, user_id uuid);
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can vote') THEN
  CREATE POLICY "Authenticated users can vote" ON votes FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
CREATE POLICY "Public read votes" ON votes FOR SELECT USING (true);
CREATE POLICY "Users can delete own votes" ON votes FOR DELETE USING (auth.uid() = user_id);
`;

const UPDATE_POLICY = readFileSync('supabase/migrations/20260930000003_votes_update_policy.sql', 'utf8');

test('votes with INSERT/SELECT/DELETE only does not allow an upsert to update', () => {
  const tables = replayPolicies([VOTES_2026_02]);
  assert.equal(tables.get('votes').policies.get('authenticated users can vote'), 'INSERT');
  assert.equal(allowsUpdate(tables.get('votes')), false);
});

test('the WP5 migration is what lets it through', () => {
  const tables = replayPolicies([VOTES_2026_02, UPDATE_POLICY]);
  assert.equal(allowsUpdate(tables.get('votes')), true);
});

test('the WP5 migration holds only the UPDATE policy', () => {
  const code = UPDATE_POLICY.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim();
  const statements = code.split(';').map((s) => s.trim()).filter(Boolean);
  assert.equal(statements.length, 2);
  assert.match(statements[0], /^DROP POLICY IF EXISTS "Users can update own votes" ON public\.votes$/);
  assert.match(statements[1], /^CREATE POLICY "Users can update own votes" ON public\.votes FOR UPDATE /);
});

test('a later DROP POLICY takes the update path away again', () => {
  const tables = replayPolicies([
    VOTES_2026_02,
    UPDATE_POLICY,
    'DROP POLICY IF EXISTS "Users can update own votes" ON public.votes;',
  ]);
  assert.equal(allowsUpdate(tables.get('votes')), false);
});

test('a policy with no FOR clause is ALL, and ALL allows the update', () => {
  const tables = replayPolicies([
    'ALTER TABLE public.t ENABLE ROW LEVEL SECURITY;',
    'CREATE POLICY "own rows" ON public.t USING (auth.uid() = user_id);',
  ]);
  assert.equal(tables.get('t').policies.get('own rows'), 'ALL');
  assert.equal(allowsUpdate(tables.get('t')), true);
});

test('a table without RLS needs no policy; an unknown table is null', () => {
  const tables = replayPolicies(['CREATE TABLE public.open_table (id int);']);
  assert.equal(allowsUpdate(tables.get('open_table')), null);
  const withRlsOff = replayPolicies(['CREATE POLICY "x" ON t2 FOR SELECT USING (true);']);
  assert.equal(allowsUpdate(withRlsOff.get('t2')), true);
});

test('policy DDL inside a function body is not replayed', () => {
  const tables = replayPolicies([
    'ALTER TABLE t3 ENABLE ROW LEVEL SECURITY;',
    `CREATE FUNCTION f() RETURNS void AS $fn$ BEGIN
       EXECUTE 'x'; CREATE POLICY "fake" ON t3 FOR UPDATE USING (true);
     END $fn$ LANGUAGE plpgsql;`,
  ]);
  assert.equal(allowsUpdate(tables.get('t3')), false);
});

test('findUpserts reads the table and skips ignoreDuplicates', () => {
  const source = `
    const { error } = await supabase
      .from('votes')
      .upsert(ballot, { onConflict: 'category_id,user_id' });
    await fromUnknownTable('device_tokens').upsert({ a: 1 });
    await supabase.from("content_favorites").upsert(rows, {
      onConflict: 'user_id,content_id',
      ignoreDuplicates: true,
    });
  `;
  const calls = findUpserts(source);
  assert.deepEqual(
    calls.map((c) => [c.table, c.ignoreDuplicates]),
    [
      ['votes', false],
      ['device_tokens', false],
      ['content_favorites', true],
    ],
  );
});

test('the repo passes: no browser upsert on a table without an UPDATE policy', () => {
  const { findings } = run();
  assert.deepEqual(findings.filter((f) => !f.known), []);
});
