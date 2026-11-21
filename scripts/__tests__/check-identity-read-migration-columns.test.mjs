#!/usr/bin/env node
/**
 * check-identity-read-policies.mjs taking identity columns from the
 * migrations, not only from types.ts (WEB-SEC-072).
 *
 *   node --test scripts/__tests__/check-identity-read-migration-columns.test.mjs
 *
 * Two tables were anon-readable and outside the check: event_photo_reactions,
 * because types.ts does not list it, and user_follows, because follower_id and
 * following_id were not on the column-name list. The real migrations are read
 * from disk so the test fails if either file changes shape under the parser.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeExposure, migrationIdentityTables } from '../check-identity-read-policies.mjs';

const read = (f) => ({ file: f, sql: readFileSync(`supabase/migrations/${f}`, 'utf8') });
const PHOTO_REACTIONS = read('20250830013853_56c26ece-b32b-4ad4-96bb-c54cddebfc5a.sql');
const OLD_DISCUSSIONS = read('20250829222354_97434617-7462-43a2-83c2-616142232799.sql');
const SOCIAL = read('20251110000010_add_social_features.sql');
const sql = (file, text) => ({ file, sql: text });

test('event_photo_reactions is absent from types.ts, so the types alone never saw it (control)', () => {
  const types = readFileSync('src/integrations/supabase/types.ts', 'utf8');
  assert.equal(/^ {6}event_photo_reactions: \{/m.test(types), false);
});

test('event_photo_reactions: its migration gives it an identity column and an anon read', () => {
  const ids = migrationIdentityTables([PHOTO_REACTIONS]);
  assert.ok(ids.has('event_photo_reactions'));
  const { exposed, detail } = computeExposure([PHOTO_REACTIONS], ids);
  assert.ok(exposed.has('event_photo_reactions'), detail.join('\n'));
});

test('user_follows: follower_id/following_id count because they reference auth.users', () => {
  const ids = migrationIdentityTables([SOCIAL]);
  assert.ok(ids.has('user_follows'));
  const { exposed } = computeExposure([SOCIAL], ids);
  assert.ok(exposed.has('user_follows'));
});

test('a uuid that references another content table is not a person', () => {
  const ids = migrationIdentityTables([
    sql('a.sql', 'CREATE TABLE public.tags (id uuid PRIMARY KEY, event_id uuid REFERENCES public.events(id), label text);'),
  ]);
  assert.equal(ids.has('tags'), false);
});

test('a name-listed column counts without a foreign key; profiles counts as a person', () => {
  const ids = migrationIdentityTables([
    sql('a.sql', 'CREATE TABLE IF NOT EXISTS ballots (id uuid, voter_id uuid NOT NULL);'),
    sql('b.sql', 'CREATE TABLE notes (id uuid, written_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL);'),
  ]);
  assert.ok(ids.has('ballots'));
  assert.ok(ids.has('notes'));
});

test('ALTER TABLE ... ADD COLUMN and a table-level FOREIGN KEY both mark a table', () => {
  const ids = migrationIdentityTables([
    sql('a.sql', 'CREATE TABLE gifts (id uuid, label text);\nCREATE TABLE invites (id uuid, invitee uuid, CONSTRAINT fk FOREIGN KEY (invitee) REFERENCES auth.users(id));'),
    sql('b.sql', 'ALTER TABLE public.gifts ADD COLUMN IF NOT EXISTS giver uuid REFERENCES auth.users(id);'),
  ]);
  assert.ok(ids.has('gifts'));
  assert.ok(ids.has('invites'));
});

test('DROP TABLE removes the table, and a commented-out one does not', () => {
  const ids = migrationIdentityTables([
    sql('a.sql', 'CREATE TABLE gone (user_id uuid);\nCREATE TABLE kept (user_id uuid);'),
    sql('b.sql', 'DROP TABLE IF EXISTS public.gone CASCADE;\n-- DROP TABLE kept;'),
  ]);
  assert.equal(ids.has('gone'), false);
  assert.ok(ids.has('kept'));
});

test('the old event_discussions USING (true) read is live until the table is dropped (control)', () => {
  const { exposed } = computeExposure([OLD_DISCUSSIONS], new Set(['event_discussions']));
  assert.ok(exposed.has('event_discussions'));
});

test('DROP TABLE takes its policies with it: the recreated event_discussions has no USING (true) read', () => {
  const { exposed, current } = computeExposure([OLD_DISCUSSIONS, SOCIAL], new Set(['event_discussions']));
  assert.equal(exposed.has('event_discussions'), false);
  assert.equal(current.has('event_discussions|Anyone can view event discussions'), false);
  assert.equal(current.get('event_discussions|Anyone can view discussions').using, 'NOT is_deleted');
});

test('a policy created after the table is recreated still counts', () => {
  const { exposed } = computeExposure(
    [
      sql('a.sql', 'CREATE TABLE t (user_id uuid);'),
      sql('b.sql', 'DROP TABLE t;\nCREATE TABLE t (user_id uuid);\nCREATE POLICY "open" ON public.t FOR SELECT USING (true);'),
    ],
    new Set(['t']),
  );
  assert.ok(exposed.has('t'));
});
