/**
 * Storage bucket visibility posture (WEB-LEGAL-007).
 *
 * A public bucket in Supabase means an unauthenticated GET on a guessable path,
 * with no expiry and no revocation. That is fine for files the site displays to
 * everyone and wrong for anything else, and the difference is one boolean in a
 * migration that nobody reviews twice.
 *
 * This test reads the migrations and fails when a bucket is created public
 * without being listed below. The list is the review record: adding to it is a
 * deliberate act with a stated reason, which is the point.
 */

import {
  assertEquals,
  assert,
} from 'https://deno.land/std@0.208.0/assert/mod.ts';

const MIGRATIONS = new URL('../../migrations/', import.meta.url);

/** Buckets allowed to be public, each with the reason. */
const PUBLIC_BY_DESIGN: Record<string, string> = {
  'event-photos': 'Rendered on public event pages.',
  'review-photos': 'Rendered with public reviews.',
  media: 'General image bucket rendered across public pages.',
  thumbnails: 'Preview images for public media.',
  videos: 'Rendered on public pages.',
  sitemaps: 'Fetched by search engines; must be anonymously readable.',
  'ad-creatives':
    'Approved ads are shown to everyone. Pending and rejected ones should not be public - tracked as WEB-LEGAL-011, which cannot simply flip the bucket because get_active_ads returns the stored public URL to shipped mobile binaries.',
};

/** Buckets deliberately closed, so a later migration cannot quietly reopen one. */
const MUST_NOT_BE_PUBLIC = ['user-uploads'];

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

/**
 * Bucket ids created with public = true. Scoped to INSERT INTO storage.buckets
 * statements: a bare `'a', 'b', true` pattern matches plenty of unrelated SQL
 * in this repo (cron schedules, itinerary presets) and produced false alarms.
 */
function publicBucketsCreated(sql: string): Set<string> {
  const found = new Set<string>();
  for (const stmt of sql.matchAll(/INSERT\s+INTO\s+storage\.buckets[\s\S]*?;/gi)) {
    const body = stmt[0];
    // VALUES ('id', 'name', true ...) or SELECT 'id', 'name', true
    const m = body.match(/'([a-z0-9-]+)'\s*,\s*'[a-z0-9-]+'\s*,\s*true/i);
    if (m) found.add(m[1]);
  }
  return found;
}

Deno.test('the migration set was actually read', () => {
  assert(migrations.length > 100, `expected the full migration history, got ${migrations.length}`);
  assert(allSql.includes('storage.buckets'), 'no bucket migrations found; update this test');
});

Deno.test('every public bucket is public on purpose', () => {
  const created = publicBucketsCreated(allSql);
  const undeclared = [...created].filter(
    // Closed later by 20260817000002; the "not reopened" test covers those.
    (b) => !(b in PUBLIC_BY_DESIGN) && !MUST_NOT_BE_PUBLIC.includes(b),
  );
  assertEquals(
    undeclared,
    [],
    'A bucket is created public without a stated reason. Add it to PUBLIC_BY_DESIGN ' +
      'with why anonymous read is correct, or create it private: ' + undeclared.join(', '),
  );
});

Deno.test('every declared reason is a real reason', () => {
  const thin = Object.entries(PUBLIC_BY_DESIGN)
    .filter(([, why]) => why.trim().length < 20)
    .map(([b]) => b);
  assertEquals(thin, [], `these need an actual justification: ${thin.join(', ')}`);
});

Deno.test('buckets closed on purpose are not reopened later', async () => {
  const closing = migrations.find((m) => m.name.includes('close_unused_public_bucket'));
  assert(closing, 'the migration that closes user-uploads is missing');

  for (const bucket of MUST_NOT_BE_PUBLIC) {
    assert(
      closing.sql.includes(bucket),
      `${bucket} should be closed by ${closing.name}`,
    );
    // Anything after that migration must not set it public again.
    const later = migrations.filter((m) => m.name > closing.name);
    for (const m of later) {
      const reopens = new RegExp(
        `'${bucket}'[\\s\\S]{0,200}?public\\s*=\\s*true|public\\s*=\\s*true[\\s\\S]{0,200}?'${bucket}'`,
        'i',
      );
      assert(
        !reopens.test(m.sql),
        `${m.name} appears to make ${bucket} public again after it was deliberately closed`,
      );
    }
  }
});

Deno.test('ad-creatives re-asserts public on every run, which any fix must address', () => {
  const adMigration = migrations.find((m) => m.name.includes('ad_creatives_storage'));
  assert(adMigration, 'ad-creatives migration missing');
  // Documented so WEB-LEGAL-011 does not lose an afternoon to a dashboard flip
  // that keeps reverting.
  assert(
    /ON CONFLICT[\s\S]*?public\s*=\s*true/i.test(adMigration.sql),
    'expected the ON CONFLICT DO UPDATE that re-asserts public=true; if it is gone, ' +
      'update WEB-LEGAL-011, which warns about it',
  );
});
