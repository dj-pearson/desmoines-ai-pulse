/**
 * Storage bucket posture drift check (WEB-QA-020).
 *
 * supabase/functions/_tests/storage-bucket-posture.test.ts already declares which
 * buckets may be public and which must not be. It runs offline and reads the
 * migrations, so it proves a migration was WRITTEN. It cannot prove one was
 * APPLIED -- and on 2026-08-22 that gap was real: `user-uploads` was still
 * public = true in production while the test sat green, because
 * 20260817000002_close_unused_public_bucket.sql had been merged and never run.
 *
 * This script asks production the same question the test asks the migrations.
 * It deliberately parses the declarations OUT OF that test file rather than
 * restating them, so there is exactly one list and the two checks cannot drift
 * apart.
 *
 * Credentials: a service-role key is required for THIS endpoint and that was
 * measured, not assumed. With the anon key, GET /storage/v1/bucket returns []
 * and GET /storage/v1/bucket/<id> returns 400 NoSuchBucket for every bucket,
 * public and private alike.
 *
 * CORRECTION, 2026-08-29: that is true of the bucket endpoint and it used to say
 * "anon cannot distinguish posture at all", which is not. The public OBJECT
 * endpoint does discriminate - a public bucket resolves and fails on the missing
 * key (NoSuchKey) while a private one refuses to resolve (NoSuchBucket). It
 * proves PUBLIC positively and cannot tell private from absent, which is the
 * useful direction, so scripts/check-bucket-public-anon.ts runs that question on
 * the anon key and gates pull requests. This script stays: it reads posture
 * directly rather than inferring it, and it is the only one that can see a
 * bucket that is private AND expected to exist.
 *
 * Runs in .github/workflows/rls-config-audit.yml, which is scheduled daily
 * rather than gating pull requests. That is on purpose: a PR gate that depends
 * on production being reachable turns an outage into a merge freeze.
 *
 * Usage:
 *   npx tsx scripts/check-bucket-posture.ts
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const POSTURE_TEST = join(
  ROOT,
  'supabase/functions/_tests/storage-bucket-posture.test.ts',
);

/** Mirrors scripts/check-anon-exposure.ts so both read credentials the same way. */
function env(key: string): string | undefined {
  if (process.env[key]) return process.env[key];
  const f = join(ROOT, '.env');
  if (!existsSync(f)) return undefined;
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    if (line.slice(0, i).trim() === key) {
      return line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    }
  }
  return undefined;
}

/**
 * Pull the two declarations out of the Deno test. Throws rather than guessing:
 * a silent empty list here would turn this check into a no-op that reports
 * success, which is the exact failure mode it exists to catch.
 */
export function parseDeclaredPosture(source: string): {
  publicByDesign: Set<string>;
  mustNotBePublic: Set<string>;
} {
  const objBody = source.match(
    /const PUBLIC_BY_DESIGN: Record<string, string> = \{([\s\S]*?)\n\};/,
  );
  if (!objBody) throw new Error('PUBLIC_BY_DESIGN not found in the posture test');
  const publicByDesign = new Set(
    [...objBody[1].matchAll(/^\s*'?([a-z0-9-]+)'?\s*:/gim)].map((m) => m[1]),
  );

  const arrBody = source.match(/const MUST_NOT_BE_PUBLIC = \[([\s\S]*?)\];/);
  if (!arrBody) throw new Error('MUST_NOT_BE_PUBLIC not found in the posture test');
  const mustNotBePublic = new Set(
    [...arrBody[1].matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]),
  );

  if (publicByDesign.size === 0) throw new Error('PUBLIC_BY_DESIGN parsed empty');
  return { publicByDesign, mustNotBePublic };
}

export type Bucket = { id: string; public: boolean };

/** Pure comparison, so it is testable without a network or a credential. */
export function findDrift(
  live: Bucket[],
  declared: { publicByDesign: Set<string>; mustNotBePublic: Set<string> },
): string[] {
  const drift: string[] = [];
  for (const b of live) {
    if (b.public && declared.mustNotBePublic.has(b.id)) {
      drift.push(
        `${b.id} is PUBLIC in production but is listed MUST_NOT_BE_PUBLIC. ` +
          'The migration that closes it has not been applied.',
      );
    } else if (b.public && !declared.publicByDesign.has(b.id)) {
      drift.push(
        `${b.id} is PUBLIC in production with no entry in PUBLIC_BY_DESIGN. ` +
          'Either add a justification or close the bucket.',
      );
    } else if (!b.public && declared.publicByDesign.has(b.id)) {
      // Not a security problem, but it means something the site renders is
      // unreachable, which is worth knowing before users report broken images.
      drift.push(
        `${b.id} is PRIVATE in production but PUBLIC_BY_DESIGN says it is ` +
          'rendered publicly. Files in it will not load.',
      );
    }
  }
  return drift;
}

async function main() {
  const url = env('SUPABASE_URL') ?? env('VITE_SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    // Skip rather than fail: forks and local checkouts have no service-role key,
    // and a check that is red on day one gets switched off. Same reasoning as
    // the anon-read ratchet in the same workflow.
    console.error(
      '[bucket-posture] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set - skipping.',
    );
    process.exit(0);
  }

  const declared = parseDeclaredPosture(readFileSync(POSTURE_TEST, 'utf8'));

  const res = await fetch(`${url}/storage/v1/bucket`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    console.error(`[bucket-posture] GET /storage/v1/bucket failed: ${res.status}`);
    process.exit(1);
  }
  const body: unknown = await res.json();
  if (!Array.isArray(body) || body.length === 0) {
    // An empty array is what the ANON key returns. Getting it here means the
    // credential is not actually service-role, and treating that as "no drift"
    // would be exactly the false green this script exists to prevent.
    console.error(
      '[bucket-posture] bucket list came back empty or malformed - the key is ' +
        'probably not service-role. Failing rather than reporting a false pass.',
    );
    process.exit(1);
  }

  const live: Bucket[] = body.map((b: Record<string, unknown>) => ({
    id: String(b.id ?? b.name),
    public: Boolean(b.public),
  }));

  const drift = findDrift(live, declared);
  const shown = live
    .map((b) => `${b.id}=${b.public ? 'public' : 'private'}`)
    .sort()
    .join(', ');
  console.log(`[bucket-posture] ${live.length} buckets: ${shown}`);

  if (drift.length > 0) {
    console.error(`\n[bucket-posture] ${drift.length} drift finding(s):`);
    for (const d of drift) console.error(`  - ${d}`);
    process.exit(1);
  }
  console.log('[bucket-posture] production matches the declared posture.');
}

// Only run when invoked directly, so the exported helpers stay importable.
// pathToFileURL, not string concatenation: on Windows the naive form produces
// file://C:/... against import.meta.url's file:///C:/..., the guard never
// matches, main() never runs, and the script exits 0 having checked nothing.
// A silent pass is the exact failure mode this file exists to prevent, so the
// entrypoint check gets the same scrutiny as the check itself.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('[bucket-posture]', err);
    process.exit(1);
  });
}
