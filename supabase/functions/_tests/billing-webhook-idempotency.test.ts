/**
 * Billing webhook idempotency guard (WEB-BE-030 AC4).
 *
 * The guard is a SELECT on the provider's own idempotency key before
 * processing. Two things have to hold for it to actually work, and both were
 * false at some point in this story's life:
 *
 *   1. The log table has to EXIST. It did not, for either provider, until
 *      20260822000005. A missing relation makes the lookup fail, and a failing
 *      lookup that is not checked reads as "never seen this notification" --
 *      so every retry was reprocessed. Google Play delivers at-least-once, so
 *      that is normal traffic, not an incident.
 *   2. The lookup error has to be CHECKED. Destructuring only `{ data }` hides
 *      a failure completely. Both webhooks now take `{ data, error }`.
 *
 * This suite runs offline, like the rest of supabase/functions/_tests, so it
 * asserts the structural guarantees rather than executing a webhook: the
 * UNIQUE constraint that makes a duplicate impossible even if two deliveries
 * race past the SELECT, and the error check at each call site.
 *
 * A behavioural test of the skip path needs a live database and a signed
 * provider payload; the round trip was verified by hand against production in
 * a rolled-back transaction when 20260822000005 was written (duplicate
 * message_id and duplicate notification_uuid both rejected).
 */

import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';

const MIGRATIONS = new URL('../../migrations/', import.meta.url);
const FUNCTIONS = new URL('../', import.meta.url);

async function readMigrations(): Promise<{ name: string; sql: string }[]> {
  const out: { name: string; sql: string }[] = [];
  for await (const entry of Deno.readDir(MIGRATIONS)) {
    if (!entry.isFile || !entry.name.endsWith('.sql')) continue;
    out.push({ name: entry.name, sql: await Deno.readTextFile(new URL(entry.name, MIGRATIONS)) });
  }
  return out.sort((a, b) => (a.name < b.name ? -1 : 1));
}

const migrations = await readMigrations();
const allSql = migrations.map((m) => m.sql).join('\n');

/** table -> the column the provider guarantees is unique per notification. */
const IDEMPOTENCY_KEYS: Record<string, string> = {
  apple_notification_log: 'notification_uuid',
  play_rtdn_log: 'message_id',
};

Deno.test('both billing webhook log tables are created', () => {
  for (const table of Object.keys(IDEMPOTENCY_KEYS)) {
    assert(
      new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}\\b`).test(allSql),
      `${table} is never created by any migration -- the idempotency lookup has nothing to read`,
    );
  }
});

Deno.test('the idempotency key carries a UNIQUE constraint', () => {
  for (const [table, key] of Object.entries(IDEMPOTENCY_KEYS)) {
    // Narrow to this table's CREATE TABLE body so a UNIQUE elsewhere in the
    // file cannot satisfy the assertion by accident.
    // lastIndexOf, not indexOf. 20260506000004_apple_notification_log.sql and
    // 20260506000005_play_rtdn_log.sql are DEAD FILES: schema_migrations already
    // records those two version numbers under different names
    // (media_assets_dedup, seed_blog_queue_competitor_research), so supabase db
    // push will never run them and neither table was ever created. The
    // effective definition is the latest one, and migrations are sorted by
    // version above.
    const start = allSql.lastIndexOf(`CREATE TABLE IF NOT EXISTS public.${table}`);
    assert(start !== -1, `${table} is not created`);
    const body = allSql.slice(start, allSql.indexOf(');', start));
    assert(
      new RegExp(`UNIQUE\\s*\\(\\s*${key}\\s*\\)`).test(body),
      `${table}.${key} has no UNIQUE constraint. A SELECT-then-INSERT guard ` +
        'cannot stop two concurrent deliveries; only the constraint can.',
    );
  }
});

Deno.test('the log tables are not readable without being an admin', () => {
  for (const table of Object.keys(IDEMPOTENCY_KEYS)) {
    const start = allSql.lastIndexOf(`CREATE TABLE IF NOT EXISTS public.${table}`);
    const after = allSql.slice(start);
    assert(
      new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`).test(after),
      `${table} does not enable RLS. These rows carry purchase tokens and ` +
        'original transaction ids (WEB-SEC-021).',
    );
    assert(
      /USING \(public\.is_admin\(\)\)/.test(after),
      `${table} has no admin-only read policy`,
    );
  }
});

Deno.test('both webhooks check the idempotency lookup error, not just its data', async () => {
  const fns = [
    'play-rtdn-webhook/index.ts',
    'appstore-server-notifications-v2/index.ts',
  ];
  for (const fn of fns) {
    const src = await Deno.readTextFile(new URL(fn, FUNCTIONS));
    // `const { data: x } = await ...` on the lookup is the defect: it makes a
    // failed lookup indistinguishable from "no prior row".
    assert(
      /error:\s*logLookupError/.test(src),
      `${fn} does not capture the idempotency lookup error. Destructuring only ` +
        '{ data } makes a missing table read as "never seen this notification".',
    );
    assert(
      /logLookupError/.test(src.slice(src.indexOf('logLookupError') + 1)),
      `${fn} captures logLookupError but never reads it`,
    );
  }
});

Deno.test('the log tables are reachable by the columns the webhooks write', () => {
  // Every column the two functions insert. If one is missing from the DDL the
  // insert fails at runtime with PGRST204 and, because these writes are
  // fire-and-forget, silently.
  const required: Record<string, string[]> = {
    apple_notification_log: [
      'notification_uuid', 'notification_type', 'subtype', 'original_transaction_id',
      'user_subscription_id', 'processed_at', 'status', 'error_message',
    ],
    play_rtdn_log: [
      'message_id', 'notification_type', 'purchase_token', 'subscription_id',
      'user_subscription_id', 'processed_at', 'status', 'error_message',
    ],
  };
  for (const [table, cols] of Object.entries(required)) {
    const start = allSql.lastIndexOf(`CREATE TABLE IF NOT EXISTS public.${table}`);
    const body = allSql.slice(start, allSql.indexOf(');', start));
    const missing = cols.filter((c) => !new RegExp(`\\b${c}\\b`).test(body));
    assertEquals(missing, [], `${table} is missing columns the webhook writes: ${missing.join(', ')}`);
  }
});
